"use client";
import { useEffect, useState } from "react";
import "./photo-layout.css";

export type PhotoItem = { id: string; name: string; price: number | null; note?: string; photos?: string[] };

export const money = (p: number | null) => (p == null ? "無料" : `¥${p.toLocaleString()}`);

const STORE = "ss-photo-dense";

/** Persist Dense toggle only. Default: card layout B. */
export function useDense() {
  const [dense, setDense] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try { setDense(sessionStorage.getItem(STORE) === "1"); } catch { /* ignore */ }
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    try { sessionStorage.setItem(STORE, dense ? "1" : "0"); } catch { /* ignore */ }
  }, [dense, ready]);
  return { dense, setDense, toggle: () => setDense((d) => !d) };
}

export function DenseToggle({ dense, onToggle }: { dense: boolean; onToggle: () => void }) {
  return (
    <button type="button" className={`dense-tog${dense ? " on" : ""}`}
      aria-pressed={dense} onClick={onToggle}>
      Dense
    </button>
  );
}

function labelName(name: string) {
  const t = (name || "").trim();
  return t || "Untitled";
}

/** Shared buyer/admin photo card. Default B: photo + optional price + name. Dense: photo only. */
export function PhotoCard({
  item, dense, onClick, className = "", disabled,
}: {
  item: PhotoItem; dense: boolean; onClick?: () => void; className?: string; disabled?: boolean;
}) {
  const src = (item.photos || [])[0];
  if (!src) return null;
  const cls = className ? ` ${className}` : "";
  const name = labelName(item.name);
  const showPrice = item.price != null;

  if (dense) {
    return (
      <button type="button" disabled={disabled} aria-label={name} onClick={onClick}
        className={`xtile dense${cls}`}>
        <img src={src} alt="" loading="lazy" decoding="async" />
      </button>
    );
  }

  return (
    <button type="button" disabled={disabled} aria-label={name} onClick={onClick}
      className={`xcard${cls}`}>
      <div className="xphoto"><img src={src} alt="" loading="lazy" decoding="async" /></div>
      <div className="xmeta">
        {showPrice ? <div className="xprice">{money(item.price)}</div> : null}
        <div className={`xname${!item.name?.trim() ? " empty" : ""}`}>{name}</div>
      </div>
    </button>
  );
}

export function PhotoGrid<T extends PhotoItem>({
  items, dense, onSelect, classNameFor, disabledFor,
}: {
  items: T[];
  dense: boolean;
  onSelect?: (item: T) => void;
  classNameFor?: (item: T) => string;
  disabledFor?: (item: T) => boolean;
}) {
  if (!items.length) return null;
  return (
    <div className={`xgrid${dense ? " dense" : ""}`}>
      {items.map((item) => (
        <PhotoCard key={item.id} item={item} dense={dense}
          onClick={onSelect ? () => onSelect(item) : undefined}
          className={classNameFor?.(item)}
          disabled={disabledFor?.(item)} />
      ))}
    </div>
  );
}
