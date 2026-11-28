import { NextResponse } from "next/server";
import {
  STATE_COOKIE, RET_COOKIE, SHOP_COOKIE, buildLogin, cookieOpts,
  lineConfigured, requestOrigin, safeReturn, safeShop,
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
  // State is self-contained + signed, so the callback does not depend on cookies surviving
  // the iOS LINE-app hand-off (the callback may open in a different browser context).
  const { nonce, url: to } = buildLogin(req, ret, shop);
  const res = NextResponse.redirect(to);
  // Cookies stay as a best-effort fallback/extra check where the same browser returns.
  res.cookies.set(STATE_COOKIE, nonce, cookieOpts(600));
  res.cookies.set(RET_COOKIE, ret, cookieOpts(600));
  if (shop) res.cookies.set(SHOP_COOKIE, shop, cookieOpts(600));
  else res.cookies.set(SHOP_COOKIE, "", { ...cookieOpts(0), maxAge: 0 });
  return res;
}
