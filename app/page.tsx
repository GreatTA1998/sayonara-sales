"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { dayLbl, pickupSpan, rangeLbl } from "@/lib/days";
import { SHOP_NAME } from "@/lib/sale";
import { Listings, money } from "@/components/photo-listing";

type Item = {
  id: string; name: string; price: number | null; note?: string; taken: boolean;
  photos?: string[]; availableFrom?: string; availableTo?: string; lateOnly?: boolean;
};
type State = {
  address: string; days: string[]; slots: string[]; taken: Record<string, string[]>;
  lineInviteUrl?: string | null; items: Item[];
};
type Receipt = {
  code: string; day: string; slot: string; address: string; items: string[];
  total?: number; contact?: string; contactMethod?: string;
};
type Method = "line" | "phone";

const LINE_FALLBACK = "https://line.me/ti/p/yBg2x2X_ut";
const PHONE_DISPLAY = "080-4919-2027";
const PHONE_TEL = "tel:+818049192027";

const dayOk = (i: Item, day: string) =>
  !(i.availableFrom && day < i.availableFrom) && !(i.availableTo && day > i.availableTo);
const why = (i: Item, day: string) =>
  i.taken ? "予約済み — キャンセル待ち"
    : !dayOk(i, day) ? `受け取り可能：${rangeLbl(i.availableFrom, i.availableTo)}`
    : "受け取り不可";

function LineBlock({ url }: { url: string }) {
  return (
    <div className="linebox">
      <p className="hint">リンクを開くか、QRを読み取って追加してください。</p>
      <a className="linelink" href={url} target="_blank" rel="noopener noreferrer">LINE招待リンク</a>
      <img className="lineqr" src="/line-qr.jpg" alt="LINE QR" />
    </div>
  );
}

function PhoneBlock() {
  return (
    <div className="linebox">
      <a className="linelink" href={PHONE_TEL}>{PHONE_DISPLAY}</a>
      <p className="hint">Eltonの電話番号です。タップで発信できます。</p>
    </div>
  );
}

export default function BuyerPage() {
  const [state, setState] = useState<State | null>(null);
  const [day, setDay] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<Item | null>(null);
  const [checkout, setCheckout] = useState(false);
  const [slot, setSlot] = useState<string | null>(null);
  const [method, setMethod] = useState<Method | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const lineUrl = state?.lineInviteUrl || LINE_FALLBACK;
  const span = pickupSpan(state?.days || []);

  const load = useCallback(async () => {
    const data = (await fetch("/api/state", { cache: "no-store" }).then((r) => r.json())) as State;
    setState(data);
    setDay((d) => d && data.days?.includes(d) ? d : (data.days?.[0] || ""));
  }, []);
  useEffect(() => { void load(); }, [load]);

  const freeSlots = useMemo(() => {
    const taken = new Set(state?.taken?.[day] || []);
    return (state?.slots || []).filter((s) => !taken.has(s));
  }, [state, day]);
  useEffect(() => { if (slot && !freeSlots.includes(slot)) setSlot(null); }, [freeSlots, slot]);

  const pickedItems = useMemo(
    () => (state?.items || []).filter((i) => picked.has(i.id)),
    [state, picked],
  );
  const blocked = useMemo(() => pickedItems.filter((i) => !dayOk(i, day)), [pickedItems, day]);
  const canSend = !!slot && !!method && picked.size > 0 && !blocked.length;

  function toggle(id: string) {
    const it = state?.items.find((i) => i.id === id);
    if (!it || it.taken) return;
    setPicked((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  async function book() {
    if (!picked.size || !slot || !method || busy) return;
    const bad = pickedItems.find((i) => !dayOk(i, day));
    if (bad) { setErr(`${bad.name}: ${why(bad, day)}`); return; }
    setBusy(true); setErr(null);
    try {
      const res = await fetch("/api/book", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          day, slot, itemIds: [...picked], contactMethod: method,
          contact: method === "phone" ? PHONE_DISPLAY : "LINE",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "失敗しました");
      setCheckout(false); setOpen(null); setReceipt({ ...data, contactMethod: method });
      setPicked(new Set()); setSlot(null); setMethod(null); await load();
    } catch (e) { setErr(e instanceof Error ? e.message : "失敗しました"); await load(); }
    finally { setBusy(false); }
  }

  if (receipt) {
    const viaLine = (receipt.contactMethod || method) === "line" || receipt.contact === "LINE";
    return (
      <main className="wrap">
        <h1>依頼を送信しました</h1>
        <p className="hint">Eltonに送信済みです。まだ確定ではありません。来る前に確認を待ってください。</p>
        <p>コード: <b>{receipt.code}</b></p>
        <p>日付: {dayLbl(receipt.day)}</p>
        <p>時間: {receipt.slot}</p>
        <p>合計: {money(receipt.total ?? 0)}</p>
        <p className="hint">お支払いは現金またはWise。</p>
        <p>エリア: {receipt.address}</p>
        <ul>{receipt.items.map((n) => <li key={n}>{n}</li>)}</ul>
        {viaLine ? (
          <section className="field"><span>連絡：LINE</span><LineBlock url={lineUrl} /></section>
        ) : (
          <section className="field"><span>連絡：電話</span><PhoneBlock /></section>
        )}
        <button type="button" className="dark" onClick={() => setReceipt(null)}>一覧に戻る</button>
      </main>
    );
  }

  const okOpen = open ? !open.taken : false;
  const onOpen = open ? picked.has(open.id) : false;
  const openPics = open?.photos || [];
  const openAvail = open?.lateOnly
    ? `後半のみ（${rangeLbl(open.availableFrom, state?.days?.[state.days.length - 1])}）`
    : open ? rangeLbl(open.availableFrom, open.availableTo) : "";

  return (
    <main className="buy">
      <header className="bar">
        <span className="who">
          <span className="shop">{SHOP_NAME}</span>
          <span className="area">{(state?.address || "").trim() || "区"}</span>
        </span>
        <span className="span">{span}</span>
        <button type="button" className="req"
          onClick={() => { setOpen(null); setSlot(null); setMethod("line"); setErr(null); setCheckout(true); }}>
          {picked.size ? `引き取りを依頼 (${picked.size})` : "引き取りを依頼"}
        </button>
      </header>
      {err && !checkout && <div className="err">{err}</div>}
      <Listings items={state?.items || []} onSelect={setOpen}
        classNameFor={(item) => `${picked.has(item.id) ? "on" : ""}${item.taken ? " dim" : ""}`.trim()} />
      {!state && <p className="text-sm text-muted pad">読み込み中…</p>}
      {open && !checkout && (
        <div className="mask" role="dialog" aria-modal="true" aria-label={open.name} onClick={() => setOpen(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            {openPics.length > 0 && <div className="pics">{openPics.map((src) => <img key={src} src={src} alt="" loading="lazy" decoding="async" />)}</div>}
            <div className="sp">{money(open.price)}</div>
            <h2>{open.name}</h2>
            {open.note ? <p className="sn">{open.note}</p> : null}
            {openAvail ? <p className="sm">{openAvail}</p> : null}
            {!okOpen && <p className="sw">{why(open, day || (state?.days?.[0] || ""))}</p>}
            <button type="button" className={`cta${okOpen ? (onOpen ? " soft" : " go") : ""}`} disabled={!okOpen}
              onClick={() => { toggle(open.id); setOpen(null); }}>{onOpen ? "外す" : "追加"}</button>
          </div>
        </div>
      )}
      {checkout && (
        <div className="mask" role="dialog" aria-modal="true" aria-label="引き取り日程"
          onClick={() => { setCheckout(false); setErr(null); }}>
          <div className="sheet checkout" onClick={(e) => e.stopPropagation()}>
            <h2>引き取り日程</h2>
            <div className="when">
              <select value={day} aria-label="日付" onChange={(e) => {
                const nd = e.target.value; setDay(nd); setSlot(null);
                setPicked((p) => new Set([...p].filter((id) => {
                  const it = state?.items.find((i) => i.id === id);
                  return it && !it.taken && dayOk(it, nd);
                })));
              }}>
                {(state?.days || []).map((d) => <option key={d} value={d}>{dayLbl(d)}</option>)}
              </select>
              <div className="slots trio" role="group" aria-label="時間帯">
                {(state?.slots || []).map((s) => {
                  const free = freeSlots.includes(s);
                  return (
                    <button key={s} type="button" disabled={!free}
                      className={slot === s ? "slot on" : "slot"}
                      onClick={() => free && setSlot(s)}>{s}</button>
                  );
                })}
              </div>
            </div>
            {blocked.length > 0 && (
              <p className="sw">後半のみの品目があります。日付を{rangeLbl(blocked[0].availableFrom, state?.days?.[state.days.length - 1])}以降にしてください。</p>
            )}
            {!freeSlots.length && <p className="sw">この日は空きがありません。</p>}
            <p className="hint pay">お支払いは現金またはWise。</p>
            <div className="field"><span>連絡方法</span>
              <div className="slots pair">
                <button type="button" className={method === "line" ? "slot on" : "slot"} onClick={() => setMethod("line")}>LINE</button>
                <button type="button" className={method === "phone" ? "slot on" : "slot"} onClick={() => setMethod("phone")}>電話</button>
              </div>
              {method === "line" && <LineBlock url={lineUrl} />}
              {method === "phone" && <PhoneBlock />}
            </div>
            {err && <div className="err">{err}</div>}
            <button type="button" className={`cta${canSend ? " go" : ""}`} disabled={busy || !canSend}
              onClick={book}>{busy ? "送信中…" : "依頼を送信"}</button>
          </div>
        </div>
      )}
    </main>
  );
}
