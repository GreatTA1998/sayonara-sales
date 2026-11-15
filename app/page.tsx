"use client";
import { useCallback, useEffect, useMemo, useState } from "react";

type Item = { id: string; name: string; price: number | null; note?: string; availableAfter?: string; taken: boolean };
type State = { address: string; days: string[]; items: Item[] };
type Receipt = { code: string; day: string; address: string; items: string[] };

const money = (p: number | null) => (p == null ? "Free" : `¥${p.toLocaleString()}`);
const dayLbl = (d: string) => `Nov ${Number(d.slice(8))}`;
const why = (i: Item, day: string) =>
  i.taken ? "Already booked — wait for cancel." : i.availableAfter && day < i.availableAfter
    ? `Only available after ${i.availableAfter.slice(5).replace("-", "/")}.`
    : "Unavailable";

export default function BuyerPage() {
  const [state, setState] = useState<State | null>(null);
  const [day, setDay] = useState("2026-11-01");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [tip, setTip] = useState<string | null>(null);
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

  function toggle(id: string) {
    if (!available.has(id)) return;
    setPicked((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  async function book() {
    if (!picked.size) return;
    setBusy(true); setErr(null);
    try {
      const res = await fetch("/api/book", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ day, itemIds: [...picked] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setReceipt(data); setPicked(new Set()); await load();
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

  return (
    <main style={{ maxWidth: 480, margin: "0 auto", paddingBottom: 24 }}>
      <header style={S.bar}>
        <select value={day} onChange={(e) => { setDay(e.target.value); setPicked(new Set()); }} style={S.select}>
          {(state?.days || []).map((d) => <option key={d} value={d}>{dayLbl(d)}</option>)}
        </select>
        <button type="button" disabled={busy || !picked.size} onClick={book} style={{ ...S.book, background: picked.size ? "#ff9900" : "#ccc" }}>
          Request pickup{picked.size ? ` (${picked.size})` : ""}
        </button>
      </header>
      <div style={S.meta}>{state?.address || "…"} · Asia/Tokyo</div>
      {err && <div style={S.err}>{err}</div>}
      <div style={S.grid}>
        {(state?.items || []).map((item) => {
          const ok = available.has(item.id);
          const on = picked.has(item.id);
          return (
            <button
              key={item.id}
              type="button"
              aria-label={ok ? item.name : why(item, day)}
              aria-pressed={ok ? on : undefined}
              onClick={() => (ok ? toggle(item.id) : setTip(tip === item.id ? null : item.id))}
              style={{
                ...S.cell,
                opacity: ok ? 1 : 0.55,
                borderColor: on ? "#ff9900" : "#e5e5e5",
                background: on ? "#fff8ee" : "#fff",
              }}
            >
              <span style={S.cellTop}>
                {ok ? (
                  <span style={{ ...S.check, borderColor: on ? "#ff9900" : "#999", background: on ? "#ff9900" : "#fff" }}>
                    {on ? "✓" : ""}
                  </span>
                ) : (
                  <span style={S.bang}>!</span>
                )}
                <span style={S.price}>{money(item.price)}</span>
              </span>
              <span style={S.cellName}>{item.name}</span>
              {item.note ? <span style={S.note}>{item.note}</span> : null}
              {tip === item.id && !ok && <span style={S.tip}>{why(item, day)}</span>}
            </button>
          );
        })}
      </div>
      {!state && <p style={{ padding: 12 }}>Loading…</p>}
    </main>
  );
}

const S: Record<string, React.CSSProperties> = {
  wrap: { padding: 16, maxWidth: 480, margin: "0 auto" },
  h: { fontSize: 18, margin: "0 0 12px" },
  bar: { position: "sticky", top: 0, zIndex: 10, display: "flex", gap: 8, alignItems: "center", padding: "10px 12px", background: "#fff", borderBottom: "1px solid #e5e5e5" },
  select: { flex: 1, padding: "8px 6px", borderRadius: 6, border: "1px solid #ccc" },
  book: { padding: "10px 12px", color: "#111", border: 0, borderRadius: 6, fontWeight: 700, whiteSpace: "nowrap" },
  meta: { padding: "8px 12px", color: "#555", fontSize: 13 },
  err: { padding: "6px 12px", color: "#b00020", fontSize: 13 },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(104px, 1fr))", gap: 8, padding: "0 12px 12px" },
  cell: { position: "relative", display: "flex", flexDirection: "column", alignItems: "stretch", gap: 4, minHeight: 96, padding: 10, border: "1px solid #e5e5e5", borderRadius: 8, textAlign: "left", cursor: "pointer", font: "inherit", color: "inherit" },
  cellTop: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4 },
  check: { width: 18, height: 18, borderRadius: 4, border: "1.5px solid #999", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "#fff", flexShrink: 0 },
  bang: { width: 18, height: 18, borderRadius: 9, border: "1px solid #999", background: "#f0f0f0", fontSize: 11, lineHeight: "16px", textAlign: "center", flexShrink: 0 },
  price: { fontSize: 12, fontVariantNumeric: "tabular-nums", color: "#333" },
  cellName: { fontSize: 13, fontWeight: 600, lineHeight: 1.25, wordBreak: "break-word" },
  note: { fontSize: 11, color: "#777", lineHeight: 1.2 },
  tip: { position: "absolute", left: 6, right: 6, bottom: 6, padding: "6px 8px", background: "#111", color: "#fff", borderRadius: 6, fontSize: 11, zIndex: 5, lineHeight: 1.3 },
  darkBtn: { marginTop: 12, padding: "10px 14px", background: "#111", color: "#fff", border: 0, borderRadius: 6 },
};
