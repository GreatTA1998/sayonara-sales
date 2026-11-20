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
  const [title, sub] = snack.msg.split("\n");
  return (
    <div role="status" className="snack text-base" data-k={snack.kind}>
      <span className="snack-body">{title}{sub ? <span className="snack-sub">{sub}</span> : null}</span>
      {snack.action && <button type="button" className="snack-act" onClick={snack.action.onClick}>{snack.action.label}</button>}
    </div>
  );
}
