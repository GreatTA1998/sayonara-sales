"use client";
import { useCallback, useEffect, useMemo, useState } from "react";

type Item = { id: string; name: string; price: number | null; note?: string; taken: boolean; photos?: string[]; availableFrom?: string; availableTo?: string };
type State = { address: string; days: string[]; slots: string[]; taken: Record<string, string[]>; lineInviteUrl?: string | null; items: Item[] };
type Receipt = { code: string; day: string; slot: string; address: string; items: string[]; total?: number; contact?: string; contactMethod?: string };
type Method = "line" | "phone";

const LINE_FALLBACK = "https://line.me/ti/p/yBg2x2X_ut";
const PHONE_DISPLAY = "080-4919-2027";
const PHONE_TEL = "tel:+818049192027";
const money = (p: number | null) => (p == null ? "無料" : `¥${p.toLocaleString()}`);
const WK = "月火水木金土日";
const youbi = (d: string) => {
  const [y, m, day] = d.split("-").map(Number);
  return WK[(new Date(Date.UTC(y, m - 1, day)).getUTCDay() + 6) % 7];
};
const dayLbl = (d: string) => `11月${Number(d.slice(8))}日（${youbi(d)}）`;
const rangeLbl = (from?: string, to?: string) => {
  if (!from && !to) return "";
  if (from && to && from.slice(0, 7) === to.slice(0, 7)) return `11月${Number(from.slice(8))}–${Number(to.slice(8))}日`;
  if (from && to) return `${dayLbl(from)}–${dayLbl(to)}`;
  return from ? `${dayLbl(from)}以降` : `${dayLbl(to!)}まで`;
};
const dayOk = (i: Item, day: string) => !(i.availableFrom && day < i.availableFrom) && !(i.availableTo && day > i.availableTo);
const why = (i: Item, day: string) =>
  i.taken ? "予約済み — キャンセル待ち" : !dayOk(i, day) ? `受け取り可能：${rangeLbl(i.availableFrom, i.availableTo)}` : "受け取り不可";

function LineBlock({ url }: { url: string }) {
  return (
    <div className="linebox">
      <a className="linelink" href={url} target="_blank" rel="noopener noreferrer">EltonのLINEを開く</a>
      <img className="lineqr" src="/line-qr.jpg" alt="LINE QR" />
      <p className="hint">QRを読み取るか、上のリンクから追加。</p>
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
  const [day, setDay] = useState("2026-11-01");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<Item | null>(null);
  const [checkout, setCheckout] = useState(false);
  const [slot, setSlot] = useState<string | null>(null);
  const [method, setMethod] = useState<Method | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);

  const lineUrl = state?.lineInviteUrl || LINE_FALLBACK;

  const load = useCallback(async () => {
    const data = (await fetch("/api/state", { cache: "no-store" }).then((r) => r.json())) as State;
    setState(data);
    if (data.days?.length && !data.days.includes(day)) setDay(data.days[0]);
  }, [day]);
  useEffect(() => { load(); }, [load]);

  const available = useMemo(() => new Set(
    (state?.items || []).filter((i) => !i.taken && dayOk(i, day)).map((i) => i.id)
  ), [state, day]);
  const freeSlots = useMemo(() => {
    const taken = new Set(state?.taken?.[day] || []);
    return (state?.slots || []).filter((s) => !taken.has(s));
  }, [state, day]);
  useEffect(() => { if (slot && !freeSlots.includes(slot)) setSlot(null); }, [freeSlots, slot]);

  function toggle(id: string) {
    if (!available.has(id)) return;
    setPicked((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  async function book() {
    if (!picked.size || !slot || !method || busy) return;
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

  if (checkout) {
    const names = (state?.items || []).filter((i) => picked.has(i.id));
    const canSend = !!slot && !!method && picked.size > 0;
    return (
      <main className="wrap checkout">
        <button type="button" className="back" onClick={() => { setCheckout(false); setErr(null); }}>← 戻る</button>
        <h1>引き取り日程</h1>
        <p className="hint">空き時間のみ。送信後もEltonの確認が必要です。</p>
        <label className="field"><span>日付</span>
          <select value={day} onChange={(e) => {
            const nd = e.target.value; setDay(nd); setSlot(null);
            setPicked((p) => new Set([...p].filter((id) => {
              const it = state?.items.find((i) => i.id === id);
              return it && !it.taken && dayOk(it, nd);
            })));
          }}>
            {(state?.days || []).map((d) => <option key={d} value={d}>{dayLbl(d)}</option>)}
          </select>
        </label>
        <div className="field"><span>時間帯</span>
          {freeSlots.length ? (
            <div className="slots">{freeSlots.map((s) => (
              <button key={s} type="button" className={slot === s ? "slot on" : "slot"} onClick={() => setSlot(s)}>{s}</button>
            ))}</div>
          ) : <p className="sw">この日は空きがありません。</p>}
        </div>
        <div className="field"><span>品目（{names.length}）</span>
          <ul className="clist">{names.map((i) => <li key={i.id}>{i.name} · {money(i.price)}</li>)}</ul>
          <p className="total">合計 {money(names.reduce((n, i) => n + (i.price ?? 0), 0))}</p>
          <p className="hint">お支払いは現金またはWise。</p>
        </div>
        <div className="field"><span>連絡方法</span>
          <div className="slots">
            <button type="button" className={method === "line" ? "slot on" : "slot"} onClick={() => setMethod("line")}>LINE</button>
            <button type="button" className={method === "phone" ? "slot on" : "slot"} onClick={() => setMethod("phone")}>電話</button>
          </div>
          {method === "line" && <LineBlock url={lineUrl} />}
          {method === "phone" && <PhoneBlock />}
        </div>
        {err && <div className="err">{err}</div>}
        <button type="button" className="cta" disabled={busy || !canSend} onClick={book}
          style={{ background: canSend ? "#ff9900" : "#ccc" }}>{busy ? "送信中…" : "依頼を送信"}</button>
      </main>
    );
  }

  const okOpen = open ? available.has(open.id) : false;
  const onOpen = open ? picked.has(open.id) : false;
  const openPics = open?.photos || [];
  const openRange = open ? rangeLbl(open.availableFrom, open.availableTo) : "";

  return (
    <main className="buy">
      <header className="bar">
        <select className="day" value={day} onChange={(e) => { setDay(e.target.value); setPicked(new Set()); }}>
          {(state?.days || []).map((d) => <option key={d} value={d}>{dayLbl(d)}</option>)}
        </select>
        <button type="button" className="req" disabled={!picked.size}
          onClick={() => { setSlot(null); setMethod(null); setErr(null); setCheckout(true); }}
          style={{ background: picked.size ? "#ff9900" : "#ccc" }}>
          {(() => {
            const area = (state?.address || "").trim() || "引き取り";
            const stem = /を?依頼$/.test(area) ? area : /引き取り/.test(area) ? `${area}を依頼` : `${area}で引き取りを依頼`;
            return `${stem}${picked.size ? ` (${picked.size})` : ""}`;
          })()}
        </button>
      </header>
      {err && <div className="err">{err}</div>}
      {(() => {
        const all = state?.items || [];
        const withPh = all.filter((i) => (i.photos || []).length > 0);
        const noPh = all.filter((i) => !(i.photos || []).length);
        const cls = (item: Item, extra = "") => {
          const ok = available.has(item.id);
          const on = picked.has(item.id);
          return `cell${extra}${on ? " on" : ""}${ok ? "" : " dim"}`;
        };
        return (
          <>
            {withPh.length > 0 && (
              <div className="grid photos">
                {withPh.map((item) => (
                  <button key={item.id} type="button" aria-label={item.name} onClick={() => setOpen(item)}
                    className={cls(item, " has-photo")}>
                    <img className="hero" src={(item.photos || [])[0]} alt="" />
                    <span className="chips">
                      <span className="chip price">{money(item.price)}</span>
                      <span className="chip name">{item.name}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
            {noPh.length > 0 && (
              <div className="grid">
                {noPh.map((item) => (
                  <button key={item.id} type="button" aria-label={item.name} onClick={() => setOpen(item)}
                    className={cls(item)}>
                    <span className="cap"><span className="price">{money(item.price)}</span><span className="name">{item.name}</span></span>
                  </button>
                ))}
              </div>
            )}
          </>
        );
      })()}
      {!state && <p style={{ padding: 12 }}>読み込み中…</p>}
      {open && (
        <div className="mask" role="dialog" aria-modal="true" aria-label={open.name} onClick={() => setOpen(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            {openPics.length > 0 && <div className="pics">{openPics.map((src) => <img key={src} src={src} alt="" />)}</div>}
            <div className="sp">{money(open.price)}</div>
            <h2>{open.name}</h2>
            {open.note ? <p className="sn">{open.note}</p> : null}
            {openRange ? <p className="sm">{openRange}</p> : null}
            {!okOpen && <p className="sw">{why(open, day)}</p>}
            <button type="button" className="cta" disabled={!okOpen}
              onClick={() => { toggle(open.id); setOpen(null); }}
              style={{ background: okOpen ? (onOpen ? "#eee" : "#ff9900") : "#ccc" }}>{onOpen ? "外す" : "追加"}</button>
          </div>
        </div>
      )}
    </main>
  );
}
