import type { CSSProperties, ReactNode } from "react";

export type IconName = "plus" | "more" | "trash" | "camera";

const paths: Record<IconName, ReactNode> = {
  plus: <path d="M12 5v14M5 12h14" />,
  more: (
    <>
      <circle cx="12" cy="6" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="12" cy="18" r="1.6" fill="currentColor" stroke="none" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16M9 7V5h6v2M18 7l-1 13H7L6 7" />
      <path d="M10 11v5M14 11v5" />
    </>
  ),
  camera: (
    <>
      <path d="M4 8h3l1.5-2h7L17 8h3v11H4z" />
      <circle cx="12" cy="13" r="3.2" />
    </>
  ),
};

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

export function IconBtn({
  name, label, onClick, disabled, className = "", style, size = 20,
}: {
  name: IconName; label: string; onClick?: () => void; disabled?: boolean;
  className?: string; style?: CSSProperties; size?: number;
}) {
  return (
    <button type="button" aria-label={label} disabled={disabled} onClick={onClick}
      className={`icon-btn ${className}`.trim()} style={style}>
      <Icon name={name} size={size} />
    </button>
  );
}
export function DateField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return <label className="float date-field"><span>{label}</span><span className="date-ctl">
    <input type="date" value={value} aria-label={label} onClick={(e) => { try { e.currentTarget.showPicker?.(); } catch {} }} onChange={(e) => onChange(e.target.value)} /></span></label>;
}
