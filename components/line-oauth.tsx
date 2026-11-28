"use client";
import { useEffect, useState } from "react";
import { applyLineSession, getId } from "@/lib/shop";

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
};
const ERR_EN: Record<string, string> = {
  state: "LINE login could not finish. Please try again in the same browser (Safari) where you started it.",
  token: "LINE login failed. Please try again.",
  denied: "LINE login was cancelled.",
  config: "LINE login is not available right now.",
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return { err, clearErr: () => setErr("") };
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
