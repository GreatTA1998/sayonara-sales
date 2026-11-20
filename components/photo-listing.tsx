"use client";
import { useEffect, useState } from "react";
import "./photo-layout.css";

export type PhotoItem = { id: string; name: string; price: number | null; note?: string; photos?: string[] };

/** Temporary design scaffold — remove after Elton picks size. */
const CARD_KEY = "ss-card-exp";
type CardExp = { cols: number; gap: number };
const DEF_CARD: CardExp = { cols: 3, gap: 8 };

function readCardExp(): CardExp {
  try {
    const p = JSON.parse(localStorage.getItem(CARD_KEY) || "{}") as Partial<CardExp>;
    const cols = Math.min(4, Math.max(2, Number(p.cols) || DEF_CARD.cols));
    const gap = Math.min(16, Math.max(2, Number(p.gap) || DEF_CARD.gap));
    return { cols, gap };
  } catch { return DEF_CARD; }
}

function CardSizeScaffold({ cols, gap, onChange }: {
  cols: number; gap: number; onChange: (next: CardExp) => void;
}) {
  return (
    <div className="card-exp-sw" role="group" aria-label="写真カードサイズ実験">
      <label className="card-exp-row">
        <span>列</span>
        <input type="range" min={2} max={4} step={1} value={cols}
          aria-label="列数" onChange={(e) => onChange({ cols: +e.target.value, gap })} />
        <em>{cols}</em>
      </label>
      <label className="card-exp-row">
        <span>隙</span>
        <input type="range" min={2} max={16} step={1} value={gap}
          aria-label="隙間" onChange={(e) => onChange({ cols, gap: +e.target.value })} />
        <em>{gap}</em>
      </label>
    </div>
  );
}

export const money = (p: number | null) => (p == null ? "無料" : `¥${p.toLocaleString()}`);

function labelName(name: string) {
  const t = (name || "").trim();
  return t || "無題";
}

/** Quiet “more photos” hint — bottom-right when count > 1. */
function MultiPhotoHint({ count }: { count: number }) {
  if (count < 2) return null;
  return (
    <span className="xmore" aria-hidden="true" title={`${count} photos`}>
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <rect x="3.5" y="1.5" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.2" opacity=".55" />
        <rect x="1.5" y="3.5" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.2" fill="rgba(0,0,0,.35)" />
      </svg>
    </span>
  );
}

/** Shared buyer/admin photo card — B: photo + optional price + name @ 16px. */
export function PhotoCard({
  item, onClick, className = "", disabled,
}: {
  item: PhotoItem; onClick?: () => void; className?: string; disabled?: boolean;
}) {
  const photos = item.photos || [];
  const src = photos[0];
  if (!src) return null;
  const cls = className ? ` ${className}` : "";
  const name = labelName(item.name);
  const n = photos.length;
  const aria = n > 1 ? `${name}, ${n} photos` : name;

  return (
    <button type="button" disabled={disabled} aria-label={aria} onClick={onClick}
      className={`xcard${cls}`}>
      <div className="xphoto">
        <img src={src} alt="" loading="lazy" decoding="async" />
        <MultiPhotoHint count={n} />
      </div>
      <div className="xmeta">
        {item.price != null ? <div className="xprice">{money(item.price)}</div> : null}
        <div className={`xname${!item.name?.trim() ? " empty" : ""}`}>{name}</div>
      </div>
    </button>
  );
}

/** Shared photoless tile — price (when set) + name. */
export function TextTile({
  item, onClick, className = "", disabled,
}: {
  item: PhotoItem; onClick?: () => void; className?: string; disabled?: boolean;
}) {
  const name = labelName(item.name);
  const cls = className ? ` ${className}` : "";
  return (
    <button type="button" disabled={disabled} aria-label={name} onClick={onClick}
      className={`xtxt${cls}`}>
      {item.price != null ? <span className="xprice">{money(item.price)}</span> : null}
      <span className={`xname${!item.name?.trim() ? " empty" : ""}`}>{name}</span>
    </button>
  );
}

type ListProps<T extends PhotoItem> = {
  items: T[];
  onSelect?: (item: T) => void;
  classNameFor?: (item: T) => string;
  disabledFor?: (item: T) => boolean;
};

export function PhotoGrid<T extends PhotoItem>({
  items, onSelect, classNameFor, disabledFor,
}: ListProps<T>) {
  const [exp, setExp] = useState<CardExp>(DEF_CARD);
  useEffect(() => { setExp(readCardExp()); }, []);
  function setCardExp(next: CardExp) {
    setExp(next);
    try { localStorage.setItem(CARD_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  }
  if (!items.length) return null;
  return (
    <>
      <CardSizeScaffold cols={exp.cols} gap={exp.gap} onChange={setCardExp} />
      <div className="xgrid" style={{ ["--x-cols" as string]: exp.cols, ["--x-gap" as string]: `${exp.gap}px` }}>
        {items.map((item) => (
          <PhotoCard key={item.id} item={item}
            onClick={onSelect ? () => onSelect(item) : undefined}
            className={classNameFor?.(item)}
            disabled={disabledFor?.(item)} />
        ))}
      </div>
    </>
  );
}

/** Photo cards first, then photoless tiles — same on buyer + admin. */
export function Listings<T extends PhotoItem>(props: ListProps<T>) {
  const withPh: T[] = [];
  const noPh: T[] = [];
  for (const i of props.items) ((i.photos || []).length ? withPh : noPh).push(i);
  return (
    <>
      <PhotoGrid {...props} items={withPh} />
      {noPh.length > 0 && (
        <div className="xgrid text">
          {noPh.map((item) => (
            <TextTile key={item.id} item={item}
              onClick={props.onSelect ? () => props.onSelect!(item) : undefined}
              className={props.classNameFor?.(item)}
              disabled={props.disabledFor?.(item)} />
          ))}
        </div>
      )}
    </>
  );
}
