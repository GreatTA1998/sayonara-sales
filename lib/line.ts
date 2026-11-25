/** Hard LINE Login (OAuth). Soft Jimoty/LINE names work without channel secrets. */
import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { SITE_URL } from "./site";

export const STATE_COOKIE = "ss-line-oauth-state";
export const SESS_COOKIE = "ss-line-sess";
export const RET_COOKIE = "ss-line-oauth-ret";
/** Soft shop id at OAuth start → signed into session for durable restore. */
export const SHOP_COOKIE = "ss-line-oauth-shop";

export type LineSess = { uid: string; name: string; exp: number; shop?: string };

/** dig5 or reserved elton — keep in sync with lib/shop isShop. */
export const safeShop = (raw: string | null | undefined) => {
  const s = (raw || "").trim();
  return /^\d{5}$/.test(s) || s === "elton" ? s : "";
};

/** Durable hard session (90d). Tradeoff: longer cookie lifetime if device shared. */
export const SESS_MAX_AGE = 90 * 24 * 3600;

export const lineConfigured = () =>
  !!(process.env.LINE_CHANNEL_ID?.trim() && process.env.LINE_CHANNEL_SECRET?.trim());

/** Public origin from request host (beta / apex / vercel.app each get their own). */
export const requestOrigin = (req: Request) => {
  const host = (req.headers.get("x-forwarded-host") || req.headers.get("host") || "").split(",")[0].trim();
  if (host) return `${(req.headers.get("x-forwarded-proto") || "https").split(",")[0].trim() || "https"}://${host}`;
  try { return new URL(req.url).origin; } catch { return SITE_URL; }
};

export const callbackUrl = (req: Request) => `${requestOrigin(req)}/api/auth/line/callback`;

export const safeReturn = (raw: string | null | undefined) => {
  const s = (raw || "/").trim();
  if (!s.startsWith("/") || s.startsWith("//")) return "/";
  return s.slice(0, 200);
};

const secret = () => process.env.LINE_CHANNEL_SECRET || "dev";

export const newState = () => randomBytes(16).toString("hex");

export const signSess = (s: LineSess) => {
  const body = Buffer.from(JSON.stringify(s)).toString("base64url");
  const sig = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${sig}`;
};

export const readSess = (raw: string | undefined | null): LineSess | null => {
  if (!raw) return null;
  const [body, sig] = raw.split(".");
  if (!body || !sig) return null;
  const expect = createHmac("sha256", secret()).update(body).digest("base64url");
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expect);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch { return null; }
  try {
    const s = JSON.parse(Buffer.from(body, "base64url").toString()) as LineSess;
    if (!s?.uid || !s?.name || !s.exp || Date.now() > s.exp) return null;
    return s;
  } catch { return null; }
};

export const authorizeUrl = (state: string, redirectUri: string) => {
  const q = new URLSearchParams({
    response_type: "code",
    client_id: process.env.LINE_CHANNEL_ID!.trim(),
    redirect_uri: redirectUri,
    state,
    scope: "profile openid",
    ui_locales: "ja",
    // Friend checkbox at login (Messaging OA linked to same Login provider).
    bot_prompt: "normal",
  });
  return `https://access.line.me/oauth2/v2.1/authorize?${q}`;
};

/** Messaging API long-lived token (Vercel only). Missing → push no-ops. */
export const messagingToken = () => process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim() || "";
export const lineUidOk = (to: string) => /^U[0-9a-f]{32}$/i.test(to);

export type LinePushKind = "confirm" | "decline" | "reschedule" | "waitlist" | "wait_open";

/** JP OA templates. Soft-fail callers treat skipped as ok. */
export function linePushText(
  kind: LinePushKind,
  p: { day?: string; slot?: string; code?: string; reason?: string } = {},
) {
  const when = [p.day, p.slot].filter(Boolean).join(" ");
  if (kind === "confirm") {
    return `【サヨナラセール】受取が確定しました。\n${when}${p.code ? `\n受付コード ${p.code}` : ""}`.trim();
  }
  if (kind === "reschedule") return `【サヨナラセール】受取日程が変更されました。\n${when}`.trim();
  if (kind === "waitlist") return "【サヨナラセール】キャンセル待ちに登録しました。空きが出たらお知らせします。";
  if (kind === "wait_open") return "【サヨナラセール】キャンセルが出ました。ショップページでご確認ください。";
  const reason = (p.reason || "").trim();
  return reason || "【サヨナラセール】今回はご案内できませんでした。";
}

/** POST /v2/bot/message/push. No token or bad uid → skipped (site still works). */
export async function pushLine(to: string, text: string): Promise<{ ok: boolean; skipped?: boolean }> {
  const token = messagingToken();
  if (!token || !lineUidOk(to) || !text.trim()) return { ok: true, skipped: true };
  try {
    const res = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ to, messages: [{ type: "text", text: text.slice(0, 5000) }] }),
    });
    if (!res.ok) return { ok: false };
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

export async function exchangeCode(code: string, redirectUri: string) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: process.env.LINE_CHANNEL_ID!.trim(),
    client_secret: process.env.LINE_CHANNEL_SECRET!.trim(),
  });
  const res = await fetch("https://api.line.me/oauth2/v2.1/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`token ${res.status}`);
  return (await res.json()) as { access_token: string };
}

export async function fetchProfile(accessToken: string) {
  const res = await fetch("https://api.line.me/v2/profile", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`profile ${res.status}`);
  const p = (await res.json()) as { userId: string; displayName: string };
  if (!p.userId || !p.displayName) throw new Error("bad profile");
  return p;
}

export const cookieOpts = (maxAge: number) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge,
});
