"use client";
import "./photo-layout.css";

export type PhotoItem = { id: string; name: string; price: number | null; note?: string; photos?: string[] };

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
  if (!items.length) return null;
  return (
    <div className="xgrid">
      {items.map((item) => (
        <PhotoCard key={item.id} item={item}
          onClick={onSelect ? () => onSelect(item) : undefined}
          className={classNameFor?.(item)}
          disabled={disabledFor?.(item)} />
      ))}
    </div>
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
