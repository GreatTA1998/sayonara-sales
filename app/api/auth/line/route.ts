import { NextResponse } from "next/server";
import {
  STATE_COOKIE, RET_COOKIE, authorizeUrl, callbackUrl, cookieOpts,
  lineConfigured, newState, requestOrigin, safeReturn,
} from "@/lib/line";

export const dynamic = "force-dynamic";

/** Hard login: start LINE OAuth. Soft Jimoty/LINE names work without this. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = requestOrigin(req);
  const ret = safeReturn(url.searchParams.get("return"));
  if (!lineConfigured()) {
    return NextResponse.redirect(new URL(`${ret}${ret.includes("?") ? "&" : "?"}line_err=config`, origin));
  }
  const state = newState();
  const res = NextResponse.redirect(authorizeUrl(state, callbackUrl(req)));
  res.cookies.set(STATE_COOKIE, state, cookieOpts(600));
  res.cookies.set(RET_COOKIE, ret, cookieOpts(600));
  return res;
}
