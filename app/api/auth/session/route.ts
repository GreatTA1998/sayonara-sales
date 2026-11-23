import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESS_COOKIE, cookieOpts, lineConfigured, readSess } from "@/lib/line";

export const dynamic = "force-dynamic";

/** Hard LINE OAuth session (soft-upgrade LINE name + uid→shop). */
export async function GET() {
  const jar = await cookies();
  const sess = readSess(jar.get(SESS_COOKIE)?.value);
  return NextResponse.json({
    configured: lineConfigured(),
    ok: !!sess,
    uid: sess?.uid || "",
    name: sess?.name || "",
    shop: sess?.shop || "",
  });
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESS_COOKIE, "", { ...cookieOpts(0), maxAge: 0 });
  return res;
}
