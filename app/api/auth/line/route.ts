import { NextResponse } from "next/server";
import {
  LINE_NAME_FALLBACK, lineAuthUrl, lineCallbackUrl, lineConfigured, lineSessionCookies,
} from "@/lib/line";

export const dynamic = "force-dynamic";

/** Start LINE Login. If channel env missing, demo-link as エルトン so UX can be tested. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = `${url.protocol}//${url.host}`;
  const next = url.searchParams.get("next") === "admin" ? "/admin" : "/";

  if (!lineConfigured()) {
    const res = NextResponse.redirect(`${origin}${next}?line=ok&demo=1`);
    for (const c of lineSessionCookies(`demo_${Date.now().toString(36)}`, LINE_NAME_FALLBACK)) {
      res.cookies.set(c);
    }
    return res;
  }

  const callback = lineCallbackUrl(req);
  if (!callback) return NextResponse.json({ error: "コールバックURL不明" }, { status: 500 });
  const state = `${next === "/admin" ? "a" : "b"}.${Math.random().toString(36).slice(2, 10)}`;
  const res = NextResponse.redirect(lineAuthUrl(state, callback));
  res.cookies.set("ss_line_state", state, {
    httpOnly: true, secure: process.env.NODE_ENV === "production",
    sameSite: "lax", path: "/", maxAge: 600,
  });
  return res;
}
