import { NextResponse } from "next/server";
import { exchangeLineCode, lineCallbackUrl, lineConfigured, lineSessionCookies } from "@/lib/line";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = `${url.protocol}//${url.host}`;
  const fail = (msg: string) => NextResponse.redirect(`${origin}/?line=err&m=${encodeURIComponent(msg)}`);
  if (!lineConfigured()) return fail("未設定");
  const err = url.searchParams.get("error");
  if (err) return fail(err);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return fail("不正な応答");
  const cookieState = req.headers.get("cookie")?.match(/(?:^|;\s*)ss_line_state=([^;]+)/)?.[1];
  if (!cookieState || cookieState !== state) return fail("state不一致");
  const next = state.startsWith("a.") ? "/admin" : "/";
  try {
    const callback = lineCallbackUrl(req);
    const { userId, displayName } = await exchangeLineCode(code, callback);
    const res = NextResponse.redirect(`${origin}${next}?line=ok`);
    for (const c of lineSessionCookies(userId, displayName)) res.cookies.set(c);
    res.cookies.set("ss_line_state", "", { path: "/", maxAge: 0 });
    return res;
  } catch {
    return fail("認証に失敗");
  }
}
