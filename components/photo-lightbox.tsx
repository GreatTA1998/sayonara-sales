"use client";

/** Fullscreen photo viewer. Admin passes onDelete (削除); buyer omits → view-only. */
export function PhotoLightbox({
  src, onClose, onDelete, deleteDisabled,
}: { src: string; onClose: () => void; onDelete?: () => void; deleteDisabled?: boolean }) {
  return (
    <div className={`mask lb${onDelete ? "" : " ro"}`} role="dialog" aria-modal="true" aria-label="写真"
      onClick={onClose}>
      <img src={src} alt="" onClick={(e) => e.stopPropagation()} />
      {onDelete ? (
        <button type="button" className="cta soft" disabled={deleteDisabled}
          onClick={(e) => { e.stopPropagation(); onDelete(); }}>削除</button>
      ) : null}
    </div>
  );
}
