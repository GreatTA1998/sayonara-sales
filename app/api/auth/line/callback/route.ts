import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  STATE_COOKIE, RET_COOKIE, SESS_COOKIE, callbackUrl, cookieOpts,
  exchangeCode, fetchProfile, safeReturn, signSess,
} from "@/lib/line";

export const dynamic = "force-dynamic";

function bounce(origin: string, ret: string, err?: string) {
  const u = new URL(ret, origin);
  if (err) u.searchParams.set("line_err", err);
  else u.searchParams.set("line_ok", "1");
  return u;
}

/** LINE Login callback → session cookie → soft-upgrade on client. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const jar = await cookies();
  const ret = safeReturn(jar.get(RET_COOKIE)?.value);
  const clear = (res: NextResponse) => {
    res.cookies.set(STATE_COOKIE, "", { ...cookieOpts(0), maxAge: 0 });
    res.cookies.set(RET_COOKIE, "", { ...cookieOpts(0), maxAge: 0 });
    return res;
  };

  if (url.searchParams.get("error")) {
    return clear(NextResponse.redirect(bounce(url.origin, ret, "denied")));
  }
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expect = jar.get(STATE_COOKIE)?.value;
  if (!code || !state || !expect || state !== expect) {
    return clear(NextResponse.redirect(bounce(url.origin, ret, "state")));
  }

  try {
    const redirectUri = callbackUrl(req);
    const { access_token } = await exchangeCode(code, redirectUri);
    const profile = await fetchProfile(access_token);
    const res = clear(NextResponse.redirect(bounce(url.origin, ret)));
    res.cookies.set(SESS_COOKIE, signSess({
      uid: profile.userId,
      name: profile.displayName,
      exp: Date.now() + 30 * 24 * 3600 * 1000,
    }), cookieOpts(30 * 24 * 3600));
    return res;
  } catch {
    return clear(NextResponse.redirect(bounce(url.origin, ret, "token")));
  }
}
