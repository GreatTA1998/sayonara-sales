"use client";
import { useCallback, useEffect, useMemo, useState } from "react";

type Item = { id: string; name: string; price: number | null; note?: string; taken: boolean; photos?: string[]; availableFrom?: string; availableTo?: string };
type State = { address: string; days: string[]; items: Item[] };
type Receipt = { code: string; day: string; address: string; items: string[] };

const money = (p: number | null) => (p == null ? "Free" : `¥${p.toLocaleString()}`);
const dayLbl = (d: string) => `Nov ${Number(d.slice(8))}`;
const pics = (i: Item) => (i.photos || []).slice(0, 2);
const span = (n: number) => (n === 0 ? 1 : n === 1 ? 2 : 3);
const rangeLbl = (from?: string, to?: string) => {
  if (!from && !to) return "";
  if (from && to && from.slice(0, 7) === to.slice(0, 7)) return `Nov ${Number(from.slice(8))}–${Number(to.slice(8))}`;
  if (from && to) return `${dayLbl(from)}–${dayLbl(to)}`;
  return from ? `from ${dayLbl(from)}` : `until ${dayLbl(to!)}`;
};
const dayOk = (i: Item, day: string) =>
  !(i.availableFrom && day < i.availableFrom) && !(i.availableTo && day > i.availableTo);
const why = (i: Item, day: string) =>
  i.taken ? "Already booked — wait for cancel." : !dayOk(i, day)
    ? `Only available ${rangeLbl(i.availableFrom, i.availableTo)}.` : "Unavailable";

export default function BuyerPage() {
  const [state, setState] = useState<State | null>(null);
  const [day, setDay] = useState("2026-11-01");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<Item | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);

  const load = useCallback(async () => {
    const data = (await fetch("/api/state", { cache: "no-store" }).then((r) => r.json())) as State;
    setState(data);
    if (data.days?.length && !data.days.includes(day)) setDay(data.days[0]);
  }, [day]);
  useEffect(() => { load(); }, [load]);

  const available = useMemo(() => new Set(
    (state?.items || []).filter((i) => !i.taken && dayOk(i, day)).map((i) => i.id)
  ), [state, day]);

  function toggle(id: string) {
    if (!available.has(id)) return;
    setPicked((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  async function book() {
    if (!picked.size || busy) return;
    setBusy(true); setErr(null);
    try {
      const res = await fetch("/api/book", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ day, itemIds: [...picked] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setOpen(null); setReceipt(data); setPicked(new Set()); await load();
    } catch (e) { setErr(e instanceof Error ? e.message : "Failed"); await load(); }
    finally { setBusy(false); }
  }

  if (receipt) return (
    <main className="wrap">
      <h1>Request sent</h1>
      <p style={{ margin: "0 0 10px", color: "#333", lineHeight: 1.4 }}>
        Sent to Elton — not confirmed yet. Wait for him to confirm before coming.
      </p>
      <p>Code: <b>{receipt.code}</b></p>
      <p>Day: {dayLbl(receipt.day)}</p>
      <p>Area: {receipt.address}</p>
      <ul>{receipt.items.map((n) => <li key={n}>{n}</li>)}</ul>
      <button type="button" className="dark" onClick={() => setReceipt(null)}>Back to list</button>
    </main>
  );

  const okOpen = open ? available.has(open.id) : false;
  const onOpen = open ? picked.has(open.id) : false;
  const openPics = open ? pics(open) : [];
  const openRange = open ? rangeLbl(open.availableFrom, open.availableTo) : "";

  return (
    <main className="buy">
      <header className="bar">
        <select value={day} onChange={(e) => { setDay(e.target.value); setPicked(new Set()); }}>
          {(state?.days || []).map((d) => <option key={d} value={d}>{dayLbl(d)}</option>)}
        </select>
        <button type="button" className="req" disabled={busy || !picked.size} onClick={book}
          style={{ background: picked.size ? "#ff9900" : "#ccc" }}>
          Request pickup{picked.size ? ` (${picked.size})` : ""}
        </button>
      </header>
      <div className="meta">{state?.address || "…"} · Asia/Tokyo</div>
      {err && <div className="err">{err}</div>}
      <div className="grid">
        {(state?.items || []).map((item) => {
          const ok = available.has(item.id);
          const on = picked.has(item.id);
          const ph = pics(item);
          const n = ph.length;
          return (
            <button key={item.id} type="button" aria-label={item.name} onClick={() => setOpen(item)}
              className={`cell ${n ? "photo" : "text"}${on ? " on" : ""}${ok ? "" : " dim"}`}
              style={{ gridColumn: `span ${span(n)}` }}>
              {n > 0 && (
                <span className="photos" style={{ gridTemplateColumns: n === 2 ? "1fr 1fr" : "1fr" }}>
                  {ph.map((src) => <img key={src} src={src} alt="" />)}
                </span>
              )}
              <span className={`cap${n ? " on" : ""}`}>
                <span className="price">{money(item.price)}</span>
                <span className="name">{item.name}</span>
                {!n && item.note ? <span className="note">{item.note}</span> : null}
              </span>
            </button>
          );
        })}
      </div>
      {!state && <p style={{ padding: 12 }}>Loading…</p>}
      {open && (
        <div className="mask" role="dialog" aria-modal="true" aria-label={open.name} onClick={() => setOpen(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            {openPics.length > 0 && (
              <div className="pics" style={{ gridTemplateColumns: openPics.length === 2 ? "1fr 1fr" : "1fr" }}>
                {openPics.map((src) => <img key={src} src={src} alt="" />)}
              </div>
            )}
            <div className="sp">{money(open.price)}</div>
            <h2>{open.name}</h2>
            {open.note ? <p className="sn">{open.note}</p> : null}
            {openRange ? <p className="sm">{openRange}</p> : null}
            {!okOpen && <p className="sw">{why(open, day)}</p>}
            <button type="button" className="cta" disabled={!okOpen}
              onClick={() => { toggle(open.id); setOpen(null); }}
              style={{ background: okOpen ? (onOpen ? "#eee" : "#ff9900") : "#ccc" }}>
              {onOpen ? "Remove" : "Add"}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
