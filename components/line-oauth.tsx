"use client";
import { useEffect } from "react";
import { applyLineSession, getId } from "@/lib/shop";

function cleanUrl() {
  const u = new URL(window.location.href);
  let dirty = false;
  for (const k of ["line_ok", "line_err"]) {
    if (u.searchParams.has(k)) { u.searchParams.delete(k); dirty = true; }
  }
  if (dirty) window.history.replaceState({}, "", u.pathname + u.search + u.hash);
}

/** Soft+hard hydrate from LINE cookie; clean ?line_ok/?line_err. AppNav mounts app-wide. */
export function useLineOAuthReturn(onDone?: () => void) {
  useEffect(() => {
    const u = new URL(window.location.href);
    const dirty = u.searchParams.has("line_ok") || u.searchParams.has("line_err");
    void applyLineSession().then((s) => {
      if (dirty) cleanUrl();
      // Stale dig5 path after LINE → stamped shop (ownerLineUid).
      const id = s?.shop || getId();
      const m = window.location.pathname.match(/^\/s\/([^/]+)(\/admin)?/);
      if (dirty && id && m?.[1] && m[1] !== id) {
        window.location.replace(m[2] ? `/s/${id}/admin` : `/s/${id}`);
        return;
      }
      onDone?.();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

export const lineLoginHref = () => {
  if (typeof window === "undefined") return "/api/auth/line";
  const q = new URLSearchParams({
    return: window.location.pathname + window.location.search || "/",
  });
  const shop = getId();
  if (shop) q.set("shop", shop);
  return `/api/auth/line?${q}`;
};

/** Hard login. Needs LINE_CHANNEL_ID/SECRET on Vercel; else ?line_err=config. */
export function LineLoginLink() {
  return <a className="cta line" href={lineLoginHref()}>LINEでログイン</a>;
}
