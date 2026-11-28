import { NextResponse } from "next/server";
import { buildLogin, lineConfigured, safeReturn, safeShop } from "@/lib/line";

export const dynamic = "force-dynamic";

/**
 * Pre-signed LINE authorize URL for the login button. The button then navigates straight to
 * access.line.me on tap (no hop through our server), which is what lets iOS universal links
 * open the LINE app. Same state as /api/auth/line, which stays as the fallback href.
 */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const ret = safeReturn(q.get("return"));
  const shop = safeShop(q.get("shop"));
  if (!lineConfigured()) return NextResponse.json({ url: "" });
  const { nonce, url } = buildLogin(req, ret, shop);
  // No cookies here: several tabs/links can prefetch, so the tap handler binds the browser
  // (sets the state cookie) for the one URL it actually navigates to.
  return NextResponse.json({ url, nonce, exp: Date.now() + 540_000 }, { headers: { "Cache-Control": "no-store" } });
}
