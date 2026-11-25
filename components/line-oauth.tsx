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
    void applyLineSession().finally(() => {
      if (dirty) cleanUrl();
      onDone?.();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

export const lineLoginHref = (ret?: string) => {
  if (typeof window === "undefined") return "/api/auth/line";
  const q = new URLSearchParams({
    return: ret || window.location.pathname + window.location.search || "/",
  });
  const shop = getId();
  if (shop) q.set("shop", shop);
  return `/api/auth/line?${q}`;
};

/** Pending waitlist join after OAuth (shop|itemId). */
export const WL_KEY = "ss-wl";
/** Pending shop claim after OAuth (shop id). */
export const CLAIM_KEY = "ss-claim";

/** Hard login. Needs LINE_CHANNEL_ID/SECRET on Vercel; else ?line_err=config. */
export function LineLoginLink({ onNavigate }: { onNavigate?: () => void } = {}) {
  return (
    <a className="cta line" href={lineLoginHref()}
      onClick={() => { onNavigate?.(); }}>LINEでログイン</a>
  );
}
