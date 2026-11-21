"use client";
import { useEffect, useState } from "react";
import { byPrice, type PriceDir } from "@/lib/sale";
import "./photo-layout.css";

export type PhotoItem = { id: string; name: string; price: number | null; note?: string; photos?: string[] };
export { byPrice, type PriceDir };

const PRICE_DIR_KEY = "ss-price-dir";
const DENSE_KEY = "ss-dense";

function useLS(key: string, init: string) {
  const [v, setV] = useState(init);
  useEffect(() => { try { const x = localStorage.getItem(key); if (x != null) setV(x); } catch { /* ignore */ } }, [key]);
  return [v, (n: string) => { setV(n); try { localStorage.setItem(key, n); } catch { /* ignore */ } }] as const;
}

export function usePriceDir(): [PriceDir, (d: PriceDir) => void] {
  const [v, set] = useLS(PRICE_DIR_KEY, "asc");
  return [v === "desc" ? "desc" : "asc", set as (d: PriceDir) => void];
}

export function useDense(): [boolean, (on: boolean) => void] {
  const [v, set] = useLS(DENSE_KEY, "0");
  return [v === "1", (on) => set(on ? "1" : "0")];
}

/** Dual-option pill — selected = current mode (not flip-to). */
export function Seg({ label, opts, value, onPick }: {
  label: string; opts: [string, string][]; value: string; onPick: (v: string) => void;
}) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {opts.map(([v, t]) => (
        <button key={v} type="button" className={value === v ? "on" : undefined}
          aria-pressed={value === v} onClick={() => onPick(v)}>{t}</button>
      ))}
    </div>
  );
}

/** Shared tools: 通常|密集 + 安→高|高→安 (buyer + admin). */
export function ListingTools({
  dir, onDir, dense, onDense,
}: {
  dir: PriceDir; onDir: (d: PriceDir) => void;
  dense: boolean; onDense: (on: boolean) => void;
}) {
  return (
    <div className="psort-row">
      <Seg label="表示" value={dense ? "1" : "0"} onPick={(v) => onDense(v === "1")}
        opts={[["0", "通常"], ["1", "密集"]]} />
      <Seg label="価格順" value={dir} onPick={(v) => onDir(v as PriceDir)}
        opts={[["asc", "安→高"], ["desc", "高→安"]]} />
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

/** Shared buyer/admin photo card — B: photo + optional price + name @ 16px. Dense = photo only. */
export function PhotoCard({
  item, onClick, className = "", disabled, dense,
}: {
  item: PhotoItem; onClick?: () => void; className?: string; disabled?: boolean; dense?: boolean;
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
      className={`xcard${dense ? " dense" : ""}${cls}`}>
      <div className="xphoto">
        <img src={src} alt="" loading="lazy" decoding="async" />
        <MultiPhotoHint count={n} />
      </div>
      {!dense && (
        <div className="xmeta">
          {item.price != null ? <div className="xprice">{money(item.price)}</div> : null}
          <div className={`xname${!item.name?.trim() ? " empty" : ""}`}>{name}</div>
        </div>
      )}
    </button>
  );
}

/** Shared photoless tile — price + name; dense = one-line name, no card. */
export function TextTile({
  item, onClick, className = "", disabled, dense,
}: {
  item: PhotoItem; onClick?: () => void; className?: string; disabled?: boolean; dense?: boolean;
}) {
  const name = labelName(item.name);
  const cls = className ? ` ${className}` : "";
  return (
    <button type="button" disabled={disabled} aria-label={name} onClick={onClick}
      className={`xtxt${dense ? " dense" : ""}${cls}`}>
      {!dense && item.price != null ? <span className="xprice">{money(item.price)}</span> : null}
      <span className={`xname${!item.name?.trim() ? " empty" : ""}`}>{name}</span>
    </button>
  );
}

type ListProps<T extends PhotoItem> = {
  items: T[];
  onSelect?: (item: T) => void;
  classNameFor?: (item: T) => string;
  disabledFor?: (item: T) => boolean;
  dense?: boolean;
};

/** Photo cards first, then photoless tiles — same on buyer + admin. */
export function Listings<T extends PhotoItem>(p: ListProps<T>) {
  const withPh: T[] = [];
  const noPh: T[] = [];
  for (const i of p.items) ((i.photos || []).length ? withPh : noPh).push(i);
  const props = (item: T) => ({
    item, dense: p.dense, className: p.classNameFor?.(item), disabled: p.disabledFor?.(item),
    onClick: p.onSelect ? () => p.onSelect!(item) : undefined,
  });
  return (
    <>
      {withPh.length > 0 && (
        <div className={`xgrid${p.dense ? " dense" : ""}`}>
          {withPh.map((item) => <PhotoCard key={item.id} {...props(item)} />)}
        </div>
      )}
      {noPh.length > 0 && (
        <div className={`xgrid text${p.dense ? " dense" : ""}`}>
          {noPh.map((item) => <TextTile key={item.id} {...props(item)} />)}
        </div>
      )}
    </>
  );
}
