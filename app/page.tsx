"use client";
import { useCallback, useEffect, useMemo, useState } from "react";

type Item = { id: string; name: string; price: number | null; note?: string; availableAfter?: string; taken: boolean; photos?: string[] };
type State = { address: string; days: string[]; items: Item[] };
type Receipt = { code: string; day: string; address: string; items: string[] };

const money = (p: number | null) => (p == null ? "Free" : `¥${p.toLocaleString()}`);
const dayLbl = (d: string) => `Nov ${Number(d.slice(8))}`;
const pics = (i: Item) => (i.photos || []).slice(0, 2);
const span = (n: number) => (n === 0 ? 1 : n === 1 ? 2 : 3);
const why = (i: Item, day: string) =>
  i.taken ? "Already booked — wait for cancel." : i.availableAfter && day < i.availableAfter
    ? `Only available after ${i.availableAfter.slice(5).replace("-", "/")}.`
    : "Unavailable";

export default function BuyerPage() {
  const [state, setState] = useState<State | null>(null);
  const [day, setDay] = useState("2026-11-01");
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
    (state?.items || []).filter((i) => !i.taken && !(i.availableAfter && day < i.availableAfter)).map((i) => i.id)
  ), [state, day]);

  async function requestItem(id: string) {
    if (!available.has(id) || busy) return;
    setBusy(true); setErr(null);
    try {
      const res = await fetch("/api/book", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ day, itemIds: [id] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setOpen(null); setReceipt(data); await load();
    } catch (e) { setErr(e instanceof Error ? e.message : "Failed"); await load(); }
    finally { setBusy(false); }
  }

  if (receipt) return (
    <main style={S.wrap}>
      <h1 style={S.h}>Request sent</h1>
      <p style={{ margin: "0 0 10px", color: "#333", lineHeight: 1.4 }}>
        Sent to Elton — not confirmed yet. Wait for him to confirm before coming.
      </p>
      <p>Code: <b>{receipt.code}</b></p>
      <p>Day: {dayLbl(receipt.day)}</p>
      <p>Area: {receipt.address}</p>
      <ul>{receipt.items.map((n) => <li key={n}>{n}</li>)}</ul>
      <button type="button" style={S.darkBtn} onClick={() => setReceipt(null)}>Back to list</button>
    </main>
  );

  const okOpen = open ? available.has(open.id) : false;
  const openPics = open ? pics(open) : [];

  return (
    <main style={{ maxWidth: 480, margin: "0 auto", paddingBottom: 24 }}>
      <header style={S.bar}>
        <select value={day} onChange={(e) => setDay(e.target.value)} style={S.select}>
          {(state?.days || []).map((d) => <option key={d} value={d}>{dayLbl(d)}</option>)}
        </select>
      </header>
      <div style={S.meta}>{state?.address || "…"} · Asia/Tokyo</div>
      {err && <div style={S.err}>{err}</div>}
      <div style={S.grid}>
        {(state?.items || []).map((item) => {
          const ok = available.has(item.id);
          const ph = pics(item);
          const n = ph.length;
          return (
            <button
              key={item.id}
              type="button"
              aria-label={item.name}
              onClick={() => setOpen(item)}
              style={{ ...S.cell, gridColumn: `span ${span(n)}`, opacity: ok ? 1 : 0.5, padding: n ? 0 : 6 }}
            >
              {n > 0 && (
                <span style={{ ...S.photos, gridTemplateColumns: n === 2 ? "1fr 1fr" : "1fr" }}>
                  {ph.map((src) => <img key={src} src={src} alt="" style={S.img} />)}
                </span>
              )}
              <span style={{ ...S.caption, ...(n ? S.captionOn : {}) }}>
                <span style={S.price}>{money(item.price)}</span>
                <span style={S.cellName}>{item.name}</span>
                {!n && item.note ? <span style={S.note}>{item.note}</span> : null}
              </span>
            </button>
          );
        })}
      </div>
      {!state && <p style={{ padding: 12 }}>Loading…</p>}
      {open && (
        <div style={S.mask} role="dialog" aria-modal="true" aria-label={open.name} onClick={() => setOpen(null)}>
          <div style={S.sheet} onClick={(e) => e.stopPropagation()}>
            <button type="button" style={S.close} onClick={() => setOpen(null)} aria-label="Close">×</button>
            {openPics.length > 0 && (
              <div style={{ ...S.sheetPics, gridTemplateColumns: openPics.length === 2 ? "1fr 1fr" : "1fr" }}>
                {openPics.map((src) => <img key={src} src={src} alt="" style={S.sheetImg} />)}
              </div>
            )}
            <div style={S.sheetPrice}>{money(open.price)}</div>
            <h2 style={S.sheetTitle}>{open.name}</h2>
            {open.note ? <p style={S.sheetNote}>{open.note}</p> : null}
            <p style={S.sheetMeta}>Pickup: {dayLbl(day)} · {state?.address}</p>
            {!okOpen && <p style={S.sheetWarn}>{why(open, day)}</p>}
            <button type="button" disabled={!okOpen || busy} onClick={() => requestItem(open.id)}
              style={{ ...S.cta, background: okOpen && !busy ? "#ff9900" : "#ccc" }}>
              {busy ? "Sending…" : "Request pickup"}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

const S: Record<string, React.CSSProperties> = {
  wrap: { padding: 16, maxWidth: 480, margin: "0 auto" }, h: { fontSize: 18, margin: "0 0 12px" },
  bar: { position: "sticky", top: 0, zIndex: 10, display: "flex", padding: 8, background: "#fff", borderBottom: "1px solid #e5e5e5" },
  select: { flex: 1, padding: 8, borderRadius: 6, border: "1px solid #ccc" },
  meta: { padding: "4px 8px 6px", color: "#555", fontSize: 12 }, err: { padding: "4px 8px", color: "#b00020", fontSize: 12 },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))", gap: 4, padding: "0 8px 8px", gridAutoFlow: "dense" },
  cell: { display: "flex", flexDirection: "column", minHeight: 68, border: "1px solid #e5e5e5", borderRadius: 6, textAlign: "left", cursor: "pointer", font: "inherit", color: "inherit", background: "#fff", overflow: "hidden", position: "relative" },
  photos: { display: "grid", gap: 2, flex: 1, minHeight: 68 },
  img: { width: "100%", height: "100%", objectFit: "cover", display: "block", minHeight: 68 },
  caption: { display: "flex", flexDirection: "column", gap: 2 },
  captionOn: { position: "absolute", left: 0, right: 0, bottom: 0, padding: "4px 6px", background: "linear-gradient(transparent, rgba(0,0,0,.65))", color: "#fff" },
  price: { fontSize: 11, fontVariantNumeric: "tabular-nums" },
  cellName: { fontSize: 12, fontWeight: 600, lineHeight: 1.2, wordBreak: "break-word" },
  note: { fontSize: 10, color: "#777", lineHeight: 1.15 },
  darkBtn: { marginTop: 12, padding: "10px 14px", background: "#111", color: "#fff", border: 0, borderRadius: 6 },
  mask: { position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 40, display: "flex", alignItems: "flex-end", justifyContent: "center" },
  sheet: { width: "100%", maxWidth: 480, background: "#fff", borderRadius: "14px 14px 0 0", padding: "18px 16px 20px", position: "relative" },
  close: { position: "absolute", top: 10, right: 12, border: 0, background: "transparent", fontSize: 24, lineHeight: 1, color: "#666", zIndex: 1 },
  sheetPics: { display: "grid", gap: 6, margin: "0 0 12px" },
  sheetImg: { width: "100%", aspectRatio: "4/3", objectFit: "cover", borderRadius: 8, display: "block" },
  sheetPrice: { fontSize: 14, color: "#333", marginBottom: 4 }, sheetTitle: { fontSize: 20, margin: "0 0 6px", lineHeight: 1.25 },
  sheetNote: { margin: "0 0 8px", color: "#555", fontSize: 14 }, sheetMeta: { margin: "0 0 12px", color: "#777", fontSize: 13 },
  sheetWarn: { margin: "0 0 12px", color: "#b00020", fontSize: 13 },
  cta: { width: "100%", padding: "14px 12px", border: 0, borderRadius: 8, fontWeight: 700, fontSize: 16, color: "#111" },
};
