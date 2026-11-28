import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  STATE_COOKIE, RET_COOKIE, SHOP_COOKIE, SESS_COOKIE, SESS_MAX_AGE, callbackUrl, cookieOpts,
  exchangeCode, fetchProfile, lookupOwnedShop, readState, requestOrigin, safeReturn, safeShop, signSess,
} from "@/lib/line";

export const dynamic = "force-dynamic";

function bounce(origin: string, ret: string, err?: string, otherCtx = false) {
  const u = new URL(ret, origin);
  if (err) u.searchParams.set("line_err", err);
  // "2": login finished in a browser that did not start it (LINE app / in-app browser hand-off),
  // so the Safari tab that started it has no session. The page tells the user.
  else u.searchParams.set("line_ok", otherCtx ? "2" : "1");
  return u;
}

/** LINE Login callback → session cookie → soft-upgrade on client. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = requestOrigin(req);
  const jar = await cookies();
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  // The signed state is authoritative. Cookies may be missing when the LINE app finished
  // login in a different browser context than the one that started it (iOS).
  const st = readState(state);
  const ret = safeReturn(st?.ret || jar.get(RET_COOKIE)?.value);
  const shop = safeShop(st?.shop || jar.get(SHOP_COOKIE)?.value);
  const clear = (res: NextResponse) => {
    res.cookies.set(STATE_COOKIE, "", { ...cookieOpts(0), maxAge: 0 });
    res.cookies.set(RET_COOKIE, "", { ...cookieOpts(0), maxAge: 0 });
    res.cookies.set(SHOP_COOKIE, "", { ...cookieOpts(0), maxAge: 0 });
    return res;
  };

  if (url.searchParams.get("error")) {
    return clear(NextResponse.redirect(bounce(origin, ret, "denied")));
  }
  if (!code || !state || !st) {
    return clear(NextResponse.redirect(bounce(origin, ret, "state")));
  }
  // If this browser did start a flow, it must be the same one (blocks cross-wired tabs).
  const expect = jar.get(STATE_COOKIE)?.value;
  if (expect && expect !== st.n) {
    return clear(NextResponse.redirect(bounce(origin, ret, "state")));
  }

  try {
    const { access_token } = await exchangeCode(code, callbackUrl(req));
    const profile = await fetchProfile(access_token);
    // Resolve the account server-side: an existing LINE identity always lands on the shop
    // it owns (e.g. /s/elton), never on a hint from a fresh browser.
    const owned = await lookupOwnedShop(profile.userId);
    const sessShop = owned.status === "found" ? owned.shop : shop;
    const res = clear(NextResponse.redirect(bounce(origin, ret, undefined, !expect)));
    res.cookies.set(SESS_COOKIE, signSess({
      uid: profile.userId,
      name: profile.displayName,
      exp: Date.now() + SESS_MAX_AGE * 1000,
      ...(sessShop ? { shop: sessShop } : {}),
    }), cookieOpts(SESS_MAX_AGE));
    return res;
  } catch {
    return clear(NextResponse.redirect(bounce(origin, ret, "token")));
  }
}
