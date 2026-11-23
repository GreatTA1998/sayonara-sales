"use client";
import { useEffect, useState, type ReactNode } from "react";
import { byPrice, type PriceDir } from "@/lib/sale";
import "./photo-layout.css";

export type PhotoItem = { id: string; name: string; price: number | null; note?: string; photos?: string[] };
export { byPrice, type PriceDir };

const PRICE_DIR_KEY = "ss-price-dir";
const DENSE_KEY = "ss-dense";
/** Finished pickup (picked_up) — hide by default. */
const SHOW_SOLD_KEY = "ss-show-sold";

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

export function useShowSold(): [boolean, (on: boolean) => void] {
  const [v, set] = useLS(SHOW_SOLD_KEY, "0");
  return [v === "1", (on) => set(on ? "1" : "0")];
}

function DensIco({ dense }: { dense?: boolean }) {
  const n = dense ? 3 : 2, m = dense ? 1.25 : 1.5, c = dense ? 3 : 4.5, g = dense ? 1.25 : 2, rx = dense ? 0.6 : 1;
  return (
    <svg width="18" height="18" viewBox="0 0 14 14" aria-hidden="true">
      {Array.from({ length: n * n }, (_, i) => (
        <rect key={i} x={m + (i % n) * (c + g)} y={m + ((i / n) | 0) * (c + g)}
          width={c} height={c} rx={rx} fill="currentColor" />
      ))}
    </svg>
  );
}

export function Seg({ label, opts, value, onPick }: {
  label: string; opts: [string, ReactNode, string?][]; value: string; onPick: (v: string) => void;
}) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {opts.map(([v, t, a]) => (
        <button key={v} type="button" className={value === v ? "on" : undefined}
          aria-pressed={value === v} aria-label={a} onClick={() => onPick(v)}>{t}</button>
      ))}
    </div>
  );
}

export function ListingTools({
  dir, onDir, dense, onDense, showSold, onShowSold,
}: {
  dir: PriceDir; onDir: (d: PriceDir) => void;
  dense: boolean; onDense: (on: boolean) => void;
  showSold: boolean; onShowSold: (on: boolean) => void;
}) {
  return (
    <div className="psort-row">
      <Seg label="表示" value={dense ? "1" : "0"} onPick={(v) => onDense(v === "1")}
        opts={[["0", <DensIco />, "通常"], ["1", <DensIco dense />, "密集"]]} />
      <Seg label="価格順" value={dir} onPick={(v) => onDir(v as PriceDir)}
        opts={[["asc", "安い順"], ["desc", "高い順"]]} />
      <label className="sold-tog">
        <input type="checkbox" checked={showSold} onChange={(e) => onShowSold(e.target.checked)} />
        引取済み
      </label>
    </div>
  );
}

export const money = (p: number | null) => (p == null ? "無料" : `¥${p.toLocaleString()}`);

function labelName(name: string) {
  const t = (name || "").trim();
  return t || "無題";
}

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

function PhotoCard({
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

function TextTile({
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
