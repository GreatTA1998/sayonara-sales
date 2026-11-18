"use client";
/**
 * EXPERIMENT SCAFFOLD — disposable. Not production.
 * Delete this route when comparison is done.
 * Path: /experiments/photo-cards
 */
import { useEffect, useMemo, useState } from "react";
import "./experiment.css";

type Item = { id: string; name: string; price: number | null; note?: string; photos?: string[] };
type Mode = "A" | "B" | "C" | "D";

const money = (p: number | null) => (p == null ? "無料" : `¥${p.toLocaleString()}`);

const FIXTURES: Item[] = [
  { id: "fx1", name: "IKEA desk", price: 3000, note: "sturdy, some scratches", photos: ["https://picsum.photos/seed/ss-desk/600/600"] },
  { id: "fx2", name: "Bookshelf", price: 1000, note: "white, 5 shelves", photos: ["https://picsum.photos/seed/ss-shelf/600/600"] },
  { id: "fx3", name: "Small fridge", price: 5000, note: "needs cleaning", photos: ["https://picsum.photos/seed/ss-fridge/600/600"] },
  { id: "fx4", name: "Floor lamp", price: 800, note: "warm LED", photos: ["https://picsum.photos/seed/ss-lamp/600/600"] },
  { id: "fx5", name: "Office chair", price: 2000, note: "slight wear", photos: ["https://picsum.photos/seed/ss-chair/600/600"] },
  { id: "fx6", name: "Microwave", price: 1500, photos: ["https://picsum.photos/seed/ss-micro/600/600"] },
  { id: "fx7", name: "Rice cooker", price: null, photos: ["https://picsum.photos/seed/ss-rice/600/600"] },
  { id: "fx8", name: "Hangers", price: null, photos: ["https://picsum.photos/seed/ss-hang/600/600"] },
];

const HINT: Record<Mode, string> = {
  A: "A — full-width price|name bar on photo",
  B: "B — edge photo + name/desc below (liked @ radius 20)",
  C: "C — square photo crop + price chip",
  D: "D — high density, photo only (no name/price/desc)",
};

export default function PhotoCardsExperiment() {
  const [mode, setMode] = useState<Mode>("B");
  const [radius, setRadius] = useState(20);
  const [live, setLive] = useState<Item[] | null>(null);

  useEffect(() => {
    fetch("/api/state", { cache: "no-store" })
      .then((r) => r.json())
      .then((data: { items?: Item[] }) => {
        const withPh = (data.items || []).filter((i) => (i.photos || []).length > 0);
        setLive(withPh.length ? withPh : null);
      })
      .catch(() => setLive(null));
  }, []);

  const items = useMemo(() => live ?? FIXTURES, [live]);
  const source = live ? "live listings" : "fixtures";

  return (
    <main className="exp" style={{ ["--r" as string]: `${radius}px` }}>
      <header className="exp-banner">
        <strong>EXPERIMENT</strong> — photo card playground · not production · delete later
      </header>

      <div className="exp-panel">
        <div className="exp-modes" role="group" aria-label="Design mode">
          {(["A", "B", "C", "D"] as Mode[]).map((m) => (
            <button key={m} type="button" className={mode === m ? "on" : ""}
              onClick={() => setMode(m)} aria-pressed={mode === m}>
              {m}
            </button>
          ))}
        </div>
        <label className="exp-radius">
          <span>radius {radius}px</span>
          <input type="range" min={0} max={28} value={radius}
            onChange={(e) => setRadius(Number(e.target.value))} />
        </label>
        <p className="exp-hint">{HINT[mode]} · {source}</p>
      </div>

      <div className={`exp-grid mode-${mode}`}>
        {items.map((item) => {
          const src = (item.photos || [])[0]!;
          if (mode === "B") {
            return (
              <article key={item.id} className="exp-card">
                <div className="exp-photo"><img src={src} alt="" loading="lazy" decoding="async" /></div>
                <div className="exp-meta">
                  <div className="exp-price">{money(item.price)}</div>
                  <div className="exp-name">{item.name || "（無題）"}</div>
                  <div className="exp-note">{item.note || " "}</div>
                </div>
              </article>
            );
          }
          if (mode === "D") {
            return (
              <article key={item.id} className="exp-tile bare" aria-label={item.name || "item"}>
                <img src={src} alt="" loading="lazy" decoding="async" />
              </article>
            );
          }
          return (
            <article key={item.id} className="exp-tile">
              <img src={src} alt="" loading="lazy" decoding="async" />
              {mode === "A" ? (
                <div className="exp-bar">
                  <span>{money(item.price)}</span>
                  <span className="exp-bar-name">{item.name || "（無題）"}</span>
                </div>
              ) : (
                <span className="exp-chip">{money(item.price)}</span>
              )}
            </article>
          );
        })}
      </div>
    </main>
  );
}
