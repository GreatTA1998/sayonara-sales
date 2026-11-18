import { cookies } from "next/headers";

export const LINE_COOKIE = "ss_line";
export const LINE_NAME_COOKIE = "ss_line_name";
/** Shop / seller display-name fallback (Elton). */
export const LINE_NAME_FALLBACK = "エルトン";
const COOKIE_MAX = 60 * 60 * 24 * 180;

export function lineConfigured() {
  return !!(process.env.LINE_CHANNEL_ID?.trim() && process.env.LINE_CHANNEL_SECRET?.trim());
}

export function lineCallbackUrl(req: Request) {
  const env = process.env.LINE_CALLBACK_URL?.trim();
  if (env) return env;
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") || "https";
  if (!host) return "";
  return `${proto}://${host}/api/auth/line/callback`;
}

export function lineAuthUrl(state: string, callback: string) {
  const id = process.env.LINE_CHANNEL_ID!.trim();
  const q = new URLSearchParams({
    response_type: "code",
    client_id: id,
    redirect_uri: callback,
    state,
    scope: "profile openid",
  });
  return `https://access.line.me/oauth2/v2.1/authorize?${q}`;
}

export async function exchangeLineCode(code: string, callback: string) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: callback,
    client_id: process.env.LINE_CHANNEL_ID!.trim(),
    client_secret: process.env.LINE_CHANNEL_SECRET!.trim(),
  });
  const tok = await fetch("https://api.line.me/oauth2/v2.1/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!tok.ok) throw new Error("LINE token failed");
  const { access_token } = (await tok.json()) as { access_token?: string };
  if (!access_token) throw new Error("LINE token missing");
  const prof = await fetch("https://api.line.me/v2/profile", {
    headers: { Authorization: `Bearer ${access_token}` },
  });
  if (!prof.ok) throw new Error("LINE profile failed");
  const { userId, displayName } = (await prof.json()) as { userId?: string; displayName?: string };
  if (!userId) throw new Error("LINE userId missing");
  return { userId, displayName: (displayName || "").trim() || LINE_NAME_FALLBACK };
}

function jarOpts(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

export function lineSessionCookies(userId: string, displayName: string) {
  const name = (displayName || "").trim() || LINE_NAME_FALLBACK;
  return [
    { name: LINE_COOKIE, value: userId, ...jarOpts(COOKIE_MAX) },
    { name: LINE_NAME_COOKIE, value: encodeURIComponent(name), ...jarOpts(COOKIE_MAX) },
  ];
}

export function clearLineCookies() {
  return [
    { name: LINE_COOKIE, value: "", ...jarOpts(0) },
    { name: LINE_NAME_COOKIE, value: "", ...jarOpts(0) },
  ];
}

export async function readLineSession(): Promise<{ userId?: string; displayName?: string }> {
  const jar = await cookies();
  const userId = jar.get(LINE_COOKIE)?.value?.trim() || undefined;
  const raw = jar.get(LINE_NAME_COOKIE)?.value;
  let displayName: string | undefined;
  if (raw) {
    try { displayName = decodeURIComponent(raw).trim() || undefined; }
    catch { displayName = raw.trim() || undefined; }
  }
  if (userId && !displayName) displayName = LINE_NAME_FALLBACK;
  return { userId, displayName };
}

export async function readLineUserId(): Promise<string | undefined> {
  return (await readLineSession()).userId;
}
