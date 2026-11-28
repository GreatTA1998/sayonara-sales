import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESS_COOKIE, cookieOpts, lineConfigured, lookupOwnedShop, readSess } from "@/lib/line";

export const dynamic = "force-dynamic";

/**
 * Hard LINE OAuth session (soft-upgrade LINE name + uid→shop).
 * `owned` = shop stamped with this LINE userId, looked up server-side every time.
 * `lookup` = found | none | error — client must not mint a new shop on "error".
 */
export async function GET() {
  const jar = await cookies();
  const sess = readSess(jar.get(SESS_COOKIE)?.value);
  const owned = sess ? await lookupOwnedShop(sess.uid) : null;
  return NextResponse.json({
    configured: lineConfigured(),
    ok: !!sess,
    uid: sess?.uid || "",
    name: sess?.name || "",
    shop: (owned?.status === "found" ? owned.shop : sess?.shop) || "",
    owned: owned?.status === "found",
    lookup: owned?.status || "none",
  });
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESS_COOKIE, "", { ...cookieOpts(0), maxAge: 0 });
  return res;
}
