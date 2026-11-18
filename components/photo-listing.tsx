"use client";
import { useEffect, useState } from "react";
import "./photo-layout.css";

export type PhotoMode = "A" | "B" | "C" | "D";
export type PhotoItem = { id: string; name: string; price: number | null; note?: string; photos?: string[] };

export const money = (p: number | null) => (p == null ? "無料" : `¥${p.toLocaleString()}`);

const STORE = "ss-photo-layout";
const MODES: PhotoMode[] = ["A", "B", "C", "D"];
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** EXPERIMENT: session-persisted mode + radius + density cols. Disposable. */
export function usePhotoLayout() {
  const [mode, setMode] = useState<PhotoMode>("B");
  const [radius, setRadius] = useState(20);
  const [cols, setCols] = useState(4);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try {
      const j = JSON.parse(sessionStorage.getItem(STORE) || "{}") as {
        mode?: PhotoMode; radius?: number; cols?: number;
      };
      if (j.mode && MODES.includes(j.mode)) setMode(j.mode);
      if (typeof j.radius === "number") setRadius(clamp(j.radius, 0, 28));
      if (typeof j.cols === "number") setCols(clamp(Math.round(j.cols), 2, 6));
    } catch { /* ignore */ }
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    try { sessionStorage.setItem(STORE, JSON.stringify({ mode, radius, cols })); } catch { /* ignore */ }
  }, [mode, radius, cols, ready]);
  return { mode, setMode, radius, setRadius, cols, setCols };
}

export function PhotoLayoutFooter({
  mode, setMode, radius, setRadius, cols, setCols,
}: {
  mode: PhotoMode; setMode: (m: PhotoMode) => void;
  radius: number; setRadius: (n: number) => void;
  cols: number; setCols: (n: number) => void;
}) {
  return (
    <footer className="xfoot" aria-label="Experiment layout controls">
      <span className="xfoot-tag">EXPERIMENT</span>
      <div className="xfoot-modes" role="group" aria-label="Photo layout mode">
        {MODES.map((m) => (
          <button key={m} type="button" className={mode === m ? "on" : ""}
            aria-pressed={mode === m} onClick={() => setMode(m)}>{m}</button>
        ))}
      </div>
      <label className="xfoot-slider">
        <span>cols {cols}</span>
        <input type="range" min={2} max={6} step={1} value={cols}
          onChange={(e) => setCols(Number(e.target.value))} />
      </label>
      <label className="xfoot-slider">
        <span>radius {radius}px</span>
        <input type="range" min={0} max={28} value={radius}
          onChange={(e) => setRadius(Number(e.target.value))} />
      </label>
    </footer>
  );
}

/** Shared buyer/admin photo card — modes A/B/C/D (experiment). */
export function PhotoCard({
  item, mode, onClick, className = "", disabled,
}: {
  item: PhotoItem; mode: PhotoMode; onClick?: () => void; className?: string; disabled?: boolean;
}) {
  const src = (item.photos || [])[0];
  if (!src) return null;
  const cls = className ? ` ${className}` : "";

  if (mode === "B") {
    return (
      <button type="button" disabled={disabled} aria-label={item.name || "Item"} onClick={onClick}
        className={`xcard${cls}`}>
        <div className="xphoto"><img src={src} alt="" loading="lazy" decoding="async" /></div>
        <div className="xmeta">
          <div className="xprice">{money(item.price)}</div>
          <div className="xname">{item.name || "（無題）"}</div>
          <div className="xnote">{item.note || " "}</div>
        </div>
      </button>
    );
  }

  return (
    <button type="button" disabled={disabled} aria-label={item.name || "Item"} onClick={onClick}
      className={`xtile${cls}`}>
      <img src={src} alt="" loading="lazy" decoding="async" />
      {mode === "A" && (
        <div className="xbar">
          <span>{money(item.price)}</span>
          <span className="xbar-name">{item.name || "（無題）"}</span>
        </div>
      )}
      {mode === "C" && <span className="xchip">{money(item.price)}</span>}
    </button>
  );
}

export function PhotoGrid<T extends PhotoItem>({
  items, mode, radius, cols, onSelect, classNameFor, disabledFor,
}: {
  items: T[];
  mode: PhotoMode;
  radius: number;
  cols: number;
  onSelect?: (item: T) => void;
  classNameFor?: (item: T) => string;
  disabledFor?: (item: T) => boolean;
}) {
  if (!items.length) return null;
  return (
    <div className="xwrap" style={{
      ["--x-r" as string]: `${radius}px`,
      ["--x-cols" as string]: String(cols),
    }}>
      <div className={`xgrid mode-${mode}`}>
        {items.map((item) => (
          <PhotoCard key={item.id} item={item} mode={mode}
            onClick={onSelect ? () => onSelect(item) : undefined}
            className={classNameFor?.(item)}
            disabled={disabledFor?.(item)} />
        ))}
      </div>
    </div>
  );
}
