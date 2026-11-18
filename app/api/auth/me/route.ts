import { NextResponse } from "next/server";
import { lineConfigured, readLineSession } from "@/lib/line";

export const dynamic = "force-dynamic";

export async function GET() {
  const { userId, displayName } = await readLineSession();
  return NextResponse.json({
    lineLogin: true, // always offer link (real OAuth or demo stub)
    lineConfigured: lineConfigured(),
    lineUserId: userId || null,
    displayName: userId ? (displayName || null) : null,
    linked: !!userId,
  });
}
