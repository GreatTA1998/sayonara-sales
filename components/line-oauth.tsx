"use client";
import { useEffect, useState } from "react";
import { applyLineSession, getId, getLineUid } from "@/lib/shop";

function cleanUrl() {
  const u = new URL(window.location.href);
  let dirty = false;
  for (const k of ["line_ok", "line_err"]) {
    if (u.searchParams.has(k)) { u.searchParams.delete(k); dirty = true; }
  }
  if (dirty) window.history.replaceState({}, "", u.pathname + u.search + u.hash);
}

const ERR_JA: Record<string, string> = {
  state: "LINEログインを完了できませんでした。ログインを始めたブラウザ（Safari）でもう一度お試しください。",
  token: "LINEログインに失敗しました。もう一度お試しください。",
  denied: "LINEログインがキャンセルされました。",
  config: "LINEログインは現在利用できません。",
  other: "LINEログイン完了。この画面でご利用いただけます。元のSafariに反映されない場合は、Safariで「LINEでログイン」をもう一度押してください。",
};
const ERR_EN: Record<string, string> = {
  state: "LINE login could not finish. Please try again in the same browser (Safari) where you started it.",
  token: "LINE login failed. Please try again.",
  denied: "LINE login was cancelled.",
  config: "LINE login is not available right now.",
  other: "LINE login complete. You can continue on this screen. If the Safari tab you started in isn't updated, tap “Log in with LINE” there again.",
};
/** Visible message for ?line_err=… (was silently dropped, so failed iOS logins looked like a no-op). */
export const lineErrText = (code: string, lang: string) => (lang === "ja" ? ERR_JA : ERR_EN)[code] || "";

/** Soft+hard hydrate from LINE cookie; clean ?line_ok/?line_err. AppNav mounts app-wide.
 *  Returns the ?line_err code (if any) so the shell can show it. */
export function useLineOAuthReturn(onDone?: () => void) {
  const [err, setErr] = useState("");
  useEffect(() => {
    const u = new URL(window.location.href);
    const dirty = u.searchParams.has("line_ok") || u.searchParams.has("line_err");
    const code = u.searchParams.get("line_err");
    if (code) setErr(code);
    else if (u.searchParams.get("line_ok") === "2") setErr("other");
    void applyLineSession().then((s) => {
      if (dirty) cleanUrl();
      // Only remap on LINE OAuth return — never yank open unclaimed /admin (claim URL).
      const id = s?.shop || getId();
      const m = window.location.pathname.match(/^\/s\/([^/]+)(\/admin)?/);
      if (dirty && id && m?.[1] && m[1] !== id) {
        window.location.replace(m[2] ? `/s/${id}/admin` : `/s/${id}`);
        return;
      }
      onDone?.();
    });
    // Coming back to this tab (e.g. after the LINE app hop) while still signed out: pick up a
    // session cookie that finished in another tab of the same browser.
    const back = () => {
      if (document.visibilityState === "visible" && !getLineUid()) void applyLineSession().then((s) => { if (s) onDone?.(); });
    };
    document.addEventListener("visibilitychange", back);
    window.addEventListener("pageshow", back);
    return () => { document.removeEventListener("visibilitychange", back); window.removeEventListener("pageshow", back); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return { err, clearErr: () => setErr("") };
}

/** Fallback href: our server signs state and 307s to LINE. Always works, no JS needed. */
export const lineLoginHref = (ret?: string) => {
  if (typeof window === "undefined") return "/api/auth/line";
  const q = new URLSearchParams({
    return: ret || window.location.pathname + window.location.search || "/",
  });
  const shop = getId();
  if (shop) q.set("shop", shop);
  return `/api/auth/line?${q}`;
};

type Pre = { url: string; nonce: string; exp: number };
const pre = new Map<string, Pre>();
const inflight = new Map<string, Promise<Pre | null>>();
/** Must equal STATE_COOKIE in lib/line.ts (that module is server-only). */
const STATE_COOKIE = "ss-line-oauth-state";

function prefetchLogin(fallback: string): Promise<Pre | null> {
  const hit = pre.get(fallback);
  if (hit && hit.exp > Date.now() + 30_000) return Promise.resolve(hit);
  const run = inflight.get(fallback);
  if (run) return run;
  const p = fetch(fallback.replace("/api/auth/line?", "/api/auth/line/url?"), { cache: "no-store", credentials: "same-origin" })
    .then((r) => (r.ok ? r.json() : null))
    .then((j: Pre | null) => {
      if (!j?.url || !j.nonce) return null;
      pre.set(fallback, j);
      return j;
    })
    .catch(() => null)
    .finally(() => { inflight.delete(fallback); });
  inflight.set(fallback, p);
  return p;
}

/**
 * Login button props. href is the pre-signed access.line.me authorize URL once fetched, so a
 * tap is a plain top-level navigation straight to LINE (iOS can then hand off to the LINE app
 * via universal link and return without typing). Until it is ready, or if the fetch fails,
 * href is the server-redirect route, so login always works.
 */
export function useLineLoginLink(ret?: string) {
  const fallback = lineLoginHref(ret);
  const [direct, setDirect] = useState<Pre | null>(null);
  useEffect(() => {
    let live = true;
    const go = () => void prefetchLogin(fallback).then((p) => { if (live) setDirect(p); });
    go();
    // Back/forward cache or a long idle tab can leave a stale (expired) URL: refresh.
    const again = () => { if (document.visibilityState === "visible") go(); };
    document.addEventListener("visibilitychange", again);
    window.addEventListener("pageshow", again);
    return () => { live = false; document.removeEventListener("visibilitychange", again); window.removeEventListener("pageshow", again); };
  }, [fallback]);
  const fresh = direct && direct.exp > Date.now() ? direct : null;
  return {
    href: fresh ? fresh.url : fallback,
    // Bind this browser to the attempt (CSRF check in the callback). Synchronous: never delays the tap.
    onClick: () => {
      if (!fresh) return;
      try {
        document.cookie = `${STATE_COOKIE}=${fresh.nonce}; max-age=600; path=/; samesite=lax${location.protocol === "https:" ? "; secure" : ""}`;
      } catch { /* signed state still carries the attempt */ }
    },
  };
}

/** `<a>` login button for call sites that style/label it themselves. */
export function LineLoginAnchor({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  const l = useLineLoginLink();
  return <a className="cta line" href={l.href} onClick={() => { l.onClick(); onClick?.(); }}>{children}</a>;
}

/** Pending waitlist join after OAuth (shop|itemId). */
export const WL_KEY = "ss-wl";
/** Pending shop claim after OAuth (shop id). */
export const CLAIM_KEY = "ss-claim";

/** Hard login. Needs LINE_CHANNEL_ID/SECRET on Vercel; else ?line_err=config. */
export function LineLoginLink({ onNavigate }: { onNavigate?: () => void } = {}) {
  const l = useLineLoginLink();
  return (
    <a className="cta line" href={l.href}
      onClick={() => { l.onClick(); onNavigate?.(); }}>LINEでログイン</a>
  );
}
