"use client";
import { useEffect } from "react";
import { applyLineSession } from "@/lib/shop";

function cleanUrl() {
  const u = new URL(window.location.href);
  let dirty = false;
  for (const k of ["line_ok", "line_err"]) {
    if (u.searchParams.has(k)) { u.searchParams.delete(k); dirty = true; }
  }
  if (dirty) window.history.replaceState({}, "", u.pathname + u.search + u.hash);
}

/** Soft-upgrade after LINE OAuth (?line_ok=1). AppNav mounts this app-wide. */
export function useLineOAuthReturn(onDone?: () => void) {
  useEffect(() => {
    const u = new URL(window.location.href);
    if (u.searchParams.get("line_ok") !== "1") {
      if (u.searchParams.has("line_err")) cleanUrl();
      return;
    }
    void applyLineSession().then(() => { cleanUrl(); onDone?.(); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

export const lineLoginHref = () => {
  if (typeof window === "undefined") return "/api/auth/line";
  return `/api/auth/line?return=${encodeURIComponent(window.location.pathname + window.location.search || "/")}`;
};

/** Hard login. Needs LINE_CHANNEL_ID/SECRET on Vercel; else ?line_err=config. */
export function LineLoginLink() {
  return <a className="cta line" href={lineLoginHref()}>LINEでログイン</a>;
}
