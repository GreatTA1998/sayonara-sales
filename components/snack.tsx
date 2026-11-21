"use client";
import { useCallback, useEffect, useRef, useState, type MouseEvent, type PointerEvent as PtrEv } from "react";

export type SnackKind = "ok" | "err" | "busy";
export type SnackAction = { label: string; onClick: () => void };
export type SnackState = { msg: string; kind: SnackKind; action?: SnackAction } | null;

/** Swallow the click that follows a pointerup mask dismiss (avoids click-through). */
export function swallowGhostClick() {
  const stop = (ev: Event) => { ev.preventDefault(); ev.stopPropagation(); };
  document.addEventListener("click", stop, true);
  document.addEventListener("pointerup", stop, true);
  window.setTimeout(() => {
    document.removeEventListener("click", stop, true);
    document.removeEventListener("pointerup", stop, true);
  }, 400);
}

/** Backdrop dismiss: pointerdown+up both on mask only (prefs). */
export function useMaskDismiss(onClose: () => void, blocked = false) {
  const ptr = useRef(false);
  return {
    onPointerDownCapture: (e: PtrEv<HTMLDivElement>) => {
      if (e.target !== e.currentTarget) { ptr.current = false; return; }
      e.stopPropagation();
      ptr.current = true;
    },
    onPointerUpCapture: (e: PtrEv<HTMLDivElement>) => {
      if (e.target !== e.currentTarget) return;
      e.stopPropagation();
      if (!ptr.current || blocked) return;
      if (typeof window !== "undefined" && window.getSelection()?.toString()) return;
      swallowGhostClick();
      onClose();
    },
    onClickCapture: (e: MouseEvent<HTMLDivElement>) => {
      if (e.target !== e.currentTarget) return;
      e.stopPropagation();
      e.preventDefault();
    },
  };
}

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
