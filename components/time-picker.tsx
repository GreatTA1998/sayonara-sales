"use client";
import { useEffect, useState } from "react";
import { useBodyScrollLock, useMaskDismiss } from "@/components/snack";
import { slotTime } from "@/lib/store";

/** Shared time entry: bottom sheet + native `type=time` (iOS wheel / Android clock). */
export function TimePicker({
  open, value = "11:00", onPick, onClose, title = "時間を追加", confirm = "追加",
}: {
  open: boolean; value?: string; onPick: (hhmm: string) => void; onClose: () => void;
  title?: string; confirm?: string;
}) {
  const [v, setV] = useState(slotTime(value) || "11:00");
  useEffect(() => { if (open) setV(slotTime(value) || "11:00"); }, [open, value]);
  useBodyScrollLock(open);
  const dismiss = useMaskDismiss(onClose);
  if (!open) return null;
  const t = slotTime(v);
  return (
    <div className="mask tp-mask" role="dialog" aria-modal="true" aria-label={title} {...dismiss}>
      <div className="sheet drawer tp-sheet" onClick={(e) => e.stopPropagation()}>
        <p className="tp-title">{title}</p>
        <input className="tp-input" type="time" step={900} value={v} aria-label={title}
          onChange={(e) => setV(e.target.value)} />
        <button type="button" className="cta go" disabled={!t} onClick={() => onPick(t)}>{confirm}</button>
      </div>
    </div>
  );
}
