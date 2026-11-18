import type { CSSProperties, ReactNode } from "react";

export type IconName = "plus" | "stackPlus" | "more" | "trash" | "close" | "photo";

const paths: Record<IconName, ReactNode> = {
  plus: <path d="M12 5v14M5 12h14" />,
  stackPlus: (
    <>
      <rect x="8" y="8" width="12" height="12" rx="2" opacity=".4" />
      <rect x="4" y="4" width="12" height="12" rx="2" />
      <path d="M10 8v4M8 10h4" />
    </>
  ),
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
  close: <path d="M6 6l12 12M18 6L6 18" />,
  photo: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="8.5" cy="11" r="1.5" />
      <path d="M21 16l-5-5-3.5 3.5L10 12l-5 5" />
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
