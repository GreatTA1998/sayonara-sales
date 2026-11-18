"use client";
import { useCallback, useEffect, useState } from "react";

export type SnackKind = "ok" | "err" | "busy";
export type SnackState = { msg: string; kind: SnackKind } | null;

/** Tiny phone-first toast for admin feedback. */
export function useSnack() {
  const [snack, setSnack] = useState<SnackState>(null);
  const show = useCallback((msg: string, kind: SnackKind = "ok") => {
    setSnack({ msg, kind });
  }, []);
  useEffect(() => {
    if (!snack || snack.kind === "busy") return;
    const t = setTimeout(() => setSnack(null), 2200);
    return () => clearTimeout(t);
  }, [snack]);
  return { snack, show };
}

export function Snack({ snack }: { snack: SnackState }) {
  if (!snack) return null;
  const bg = snack.kind === "err" ? "#b00020" : snack.kind === "busy" ? "#333" : "#111";
  return (
    <div role="status" className="snack text-base" style={{ background: bg }}>{snack.msg}</div>
  );
}
