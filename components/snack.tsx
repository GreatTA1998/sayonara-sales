"use client";
import { useCallback, useEffect, useState } from "react";

export type SnackKind = "ok" | "err" | "busy";
export type SnackAction = { label: string; onClick: () => void };
export type SnackState = { msg: string; kind: SnackKind; action?: SnackAction } | null;

export function useSnack() {
  const [snack, setSnack] = useState<SnackState>(null);
  const show = useCallback((msg: string, kind: SnackKind = "ok", action?: SnackAction) => {
    setSnack({ msg, kind, action });
  }, []);
  useEffect(() => {
    if (!snack || snack.kind === "busy") return;
    const t = setTimeout(() => setSnack(null), snack.action ? 4500 : 2200);
    return () => clearTimeout(t);
  }, [snack]);
  return { snack, show };
}

export function Snack({ snack }: { snack: SnackState }) {
  if (!snack) return null;
  const bg = snack.kind === "err" ? "#b00020" : snack.kind === "busy" ? "#333" : "#111";
  return (
    <div role="status" className="snack text-base" style={{ background: bg }}>
      <span>{snack.msg}</span>
      {snack.action && (
        <button type="button" className="snack-act" onClick={snack.action.onClick}>{snack.action.label}</button>
      )}
    </div>
  );
}
