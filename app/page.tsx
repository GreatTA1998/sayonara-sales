"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { dayLbl, pickupSpan, rangeLbl } from "@/lib/days";
import { Listings, money } from "@/components/photo-listing";

type Item = {
  id: string; name: string; price: number | null; note?: string; taken: boolean;
  photos?: string[]; availableFrom?: string; availableTo?: string; lateOnly?: boolean;
};
type State = {
  address: string; days: string[]; slots: string[]; taken: Record<string, string[]>;
  lineInviteUrl?: string | null; lineLogin?: boolean; items: Item[];
};
type Receipt = {
  code: string; day: string; slot: string; address: string; items: string[];
  total?: number; contact?: string; contactMethod?: string; lineLinked?: boolean;
};
type Method = "line" | "phone";
type Auth = { linked: boolean; displayName: string | null; lineLogin: boolean };

const LINE_FALLBACK = "https://line.me/ti/p/yBg2x2X_ut";
const PHONE_DISPLAY = "080-4919-2027";
const PHONE_TEL = "tel:+818049192027";
const DRAFT_KEY = "ss_draft";

const dayOk = (i: Item, day: string) =>
  !(i.availableFrom && day < i.availableFrom) && !(i.availableTo && day > i.availableTo);
const why = (i: Item, day: string) =>
  i.taken ? "予約済み — キャンセル待ち"
    : !dayOk(i, day) ? `受け取り可能：${rangeLbl(i.availableFrom, i.availableTo)}`
    : "受け取り不可";

function LineBlock({ url }: { url: string }) {
  return (
    <div className="linebox">
      <p className="linesub">リンクを開くか、QRコードを読み取って追加してください。</p>
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

function saveDraft(day: string, picked: string[]) {
  try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ day, picked })); } catch { /* ignore */ }
}

function readDraft(): { day?: string; picked?: string[] } | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    return raw ? JSON.parse(raw) as { day?: string; picked?: string[] } : null;
  } catch { return null; }
}

export default function BuyerPage() {
  const [state, setState] = useState<State | null>(null);
  const [auth, setAuth] = useState<Auth>({ linked: false, displayName: null, lineLogin: true });
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

  const loadAuth = useCallback(async () => {
    const a = await fetch("/api/auth/me", { cache: "no-store" }).then((r) => r.json()) as Auth & { displayName?: string | null };
    setAuth({ linked: !!a.linked, displayName: a.displayName || null, lineLogin: a.lineLogin !== false });
  }, []);

  const load = useCallback(async () => {
    const data = (await fetch("/api/state", { cache: "no-store" }).then((r) => r.json())) as State;
    setState(data);
    setDay((d) => d && data.days?.includes(d) ? d : (data.days?.[0] || ""));
  }, []);

  useEffect(() => {
    void load();
    void loadAuth();
    const q = new URLSearchParams(window.location.search);
    if (q.get("line") === "ok") {
      const draft = readDraft();
      if (draft?.picked?.length) setPicked(new Set(draft.picked));
      if (draft?.day) setDay(draft.day);
      try { sessionStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
      window.history.replaceState({}, "", "/");
    } else if (q.get("line") === "err") {
      setErr("LINE連携に失敗しました");
      window.history.replaceState({}, "", "/");
    }
  }, [load, loadAuth]);

  const freeSlots = useMemo(() => {
    const taken = new Set(state?.taken?.[day] || []);
    return (state?.slots || []).filter((s) => !taken.has(s));
  }, [state, day]);
  useEffect(() => { if (slot && !freeSlots.includes(slot)) setSlot(null); }, [freeSlots, slot]);

  function toggle(id: string) {
    const it = state?.items.find((i) => i.id === id);
    if (!it || it.taken) return;
    setPicked((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  function startLineLink() {
    saveDraft(day, [...picked]);
    window.location.href = "/api/auth/line";
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    await loadAuth();
  }

  async function book() {
    if (!picked.size || !slot || !method || busy) return;
    const bad = [...picked].map((id) => state?.items.find((i) => i.id === id)).find((i) => i && !dayOk(i, day));
    if (bad) {
      setErr(`${bad.name}: ${why(bad, day)}`);
      return;
    }
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
    const blocked = names.filter((i) => !dayOk(i, day));
    const canSend = !!slot && !!method && picked.size > 0 && !blocked.length;
    return (
      <main className="wrap checkout">
        <button type="button" className="back" onClick={() => { setCheckout(false); setErr(null); }}>← 戻る</button>
        <h1>引き取り日程</h1>
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
        {blocked.length > 0 && (
          <p className="sw">後半のみの品目があります。日付を{rangeLbl(blocked[0].availableFrom, state?.days?.[state.days.length - 1])}以降にしてください。</p>
        )}
        <div className="field"><span>時間帯</span>
          {freeSlots.length ? (
            <div className="slots">{freeSlots.map((s) => (
              <button key={s} type="button" className={slot === s ? "slot on" : "slot"} onClick={() => setSlot(s)}>{s}</button>
            ))}</div>
          ) : <p className="sw">この日は空きがありません。</p>}
        </div>
        <div className="field"><span>品目（{names.length}）</span>
          <ul className="clist">{names.map((i) => (
            <li key={i.id}>{i.name} · {money(i.price)}{i.lateOnly ? " · 後半のみ" : ""}</li>
          ))}</ul>
          <p className="total">合計 {money(names.reduce((n, i) => n + (i.price ?? 0), 0))}</p>
          <p className="hint">お支払いは現金またはWise。</p>
        </div>
        <div className="field"><span>連絡方法</span>
          <div className="slots pair">
            <button type="button" className={method === "line" ? "slot on" : "slot"} onClick={() => setMethod("line")}>LINE</button>
            <button type="button" className={method === "phone" ? "slot on" : "slot"} onClick={() => setMethod("phone")}>電話</button>
          </div>
          {method === "line" && <LineBlock url={lineUrl} />}
          {method === "phone" && <PhoneBlock />}
        </div>
        {auth.lineLogin && (
          <p className="hint">
            {auth.linked
              ? <>LINE連携中（{auth.displayName}） · <button type="button" className="back" style={{ margin: 0 }} onClick={() => void logout()}>解除</button></>
              : <button type="button" className="back" style={{ margin: 0 }} onClick={startLineLink}>LINEで進捗を保存（任意）</button>}
          </p>
        )}
        {err && <div className="err">{err}</div>}
        <p className="hint send-note">送信後もEltonの確認が必要です。</p>
        <button type="button" className="cta" disabled={busy || !canSend} onClick={book}
          style={{ background: canSend ? "#ff9900" : "#ccc" }}>{busy ? "送信中…" : "依頼を送信"}</button>
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
        {auth.linked && auth.displayName
          ? <span className="shop">{auth.displayName}</span>
          : <span className="area">{(state?.address || "").trim() || "エリア"}</span>}
        <span className="span">{span}</span>
        <button type="button" className="req"
          onClick={() => { setSlot(null); setMethod("line"); setErr(null); setCheckout(true); }}>
          {picked.size ? `引き取りを依頼 (${picked.size})` : "引き取りを依頼"}
        </button>
      </header>
      {err && <div className="err">{err}</div>}
      <Listings items={state?.items || []} onSelect={setOpen}
        classNameFor={(item) => `${picked.has(item.id) ? "on" : ""}${item.taken ? " dim" : ""}`.trim()} />
      {!state && <p style={{ padding: 12 }}>読み込み中…</p>}
      {open && (
        <div className="mask" role="dialog" aria-modal="true" aria-label={open.name} onClick={() => setOpen(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            {openPics.length > 0 && <div className="pics">{openPics.map((src) => <img key={src} src={src} alt="" loading="lazy" decoding="async" />)}</div>}
            <div className="sp">{money(open.price)}</div>
            <h2>{open.name}</h2>
            {open.note ? <p className="sn">{open.note}</p> : null}
            {openAvail ? <p className="sm">{openAvail}</p> : null}
            {!okOpen && <p className="sw">{why(open, day || (state?.days?.[0] || ""))}</p>}
            <button type="button" className="cta" disabled={!okOpen}
              onClick={() => { toggle(open.id); setOpen(null); }}
              style={{ background: okOpen ? (onOpen ? "#eee" : "#ff9900") : "#ccc" }}>{onOpen ? "外す" : "追加"}</button>
          </div>
        </div>
      )}
    </main>
  );
}
