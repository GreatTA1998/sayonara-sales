import { NextResponse } from "next/server";
import {
  STATE_COOKIE, RET_COOKIE, SHOP_COOKIE, authorizeUrl, callbackUrl, cookieOpts,
  lineConfigured, newState, requestOrigin, safeReturn, safeShop,
} from "@/lib/line";

export const dynamic = "force-dynamic";

/** Hard login: start LINE OAuth. Soft Jimoty/LINE names work without this. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = requestOrigin(req);
  const ret = safeReturn(url.searchParams.get("return"));
  const shop = safeShop(url.searchParams.get("shop"));
  if (!lineConfigured()) {
    return NextResponse.redirect(new URL(`${ret}${ret.includes("?") ? "&" : "?"}line_err=config`, origin));
  }
  const state = newState();
  const res = NextResponse.redirect(authorizeUrl(state, callbackUrl(req)));
  res.cookies.set(STATE_COOKIE, state, cookieOpts(600));
  res.cookies.set(RET_COOKIE, ret, cookieOpts(600));
  if (shop) res.cookies.set(SHOP_COOKIE, shop, cookieOpts(600));
  else res.cookies.set(SHOP_COOKIE, "", { ...cookieOpts(0), maxAge: 0 });
  return res;
}
