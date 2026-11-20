"use client";
import { useEffect } from "react";
import { applyLineSession } from "@/lib/shop";

/** Strip line_* query flags after OAuth return. */
function cleanUrl() {
  const u = new URL(window.location.href);
  let dirty = false;
  for (const k of ["line_ok", "line_err"]) {
    if (u.searchParams.has(k)) { u.searchParams.delete(k); dirty = true; }
  }
  if (dirty) window.history.replaceState({}, "", u.pathname + u.search + u.hash);
}

/** Soft-upgrade after LINE OAuth callback (?line_ok=1). */
export function useLineOAuthReturn(onDone?: () => void) {
  useEffect(() => {
    const u = new URL(window.location.href);
    if (u.searchParams.get("line_ok") !== "1") {
      if (u.searchParams.has("line_err")) cleanUrl();
      return;
    }
    void applyLineSession().then(() => {
      cleanUrl();
      onDone?.();
    });
    // OAuth return is one-shot from URL; ignore onDone identity churn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

export const lineLoginHref = () => {
  if (typeof window === "undefined") return "/api/auth/line";
  const path = window.location.pathname + window.location.search;
  return `/api/auth/line?return=${encodeURIComponent(path || "/")}`;
};

/** Secondary affordance under soft LINE名 form. */
export function LineLoginLink() {
  return (
    <a className="cta line" href="/api/auth/line"
      onClick={(e) => { e.preventDefault(); window.location.href = lineLoginHref(); }}>
      LINEでログイン
    </a>
  );
}
