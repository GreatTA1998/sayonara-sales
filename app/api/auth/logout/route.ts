import { NextResponse } from "next/server";
import { clearLineCookies } from "@/lib/line";

export const dynamic = "force-dynamic";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  for (const c of clearLineCookies()) res.cookies.set(c);
  return res;
}
