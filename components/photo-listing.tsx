export type PhotoItem = { id: string; name: string; price: number | null; photos?: string[] };

export const money = (p: number | null) => (p == null ? "無料" : `¥${p.toLocaleString()}`);

/** Shared buyer/admin photo-first card: image + price chip top-left. */
export function PhotoCard({
  item, onClick, className = "", disabled,
}: {
  item: PhotoItem; onClick?: () => void; className?: string; disabled?: boolean;
}) {
  const src = (item.photos || [])[0];
  if (!src) return null;
  return (
    <button type="button" disabled={disabled}
      aria-label={item.name || "Item"}
      onClick={onClick}
      className={`cell has-photo${className ? ` ${className}` : ""}`}>
      <img className="hero" src={src} alt="" loading="lazy" decoding="async" />
      <span className="chip price">{money(item.price)}</span>
    </button>
  );
}

export function PhotoGrid<T extends PhotoItem>({
  items, onSelect, classNameFor, disabledFor,
}: {
  items: T[];
  onSelect?: (item: T) => void;
  classNameFor?: (item: T) => string;
  disabledFor?: (item: T) => boolean;
}) {
  if (!items.length) return null;
  return (
    <div className="grid photos">
      {items.map((item) => (
        <PhotoCard key={item.id} item={item}
          onClick={onSelect ? () => onSelect(item) : undefined}
          className={classNameFor?.(item)}
          disabled={disabledFor?.(item)} />
      ))}
    </div>
  );
}
