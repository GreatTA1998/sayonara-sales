import { NextResponse } from "next/server";
import { addReport, listReports } from "@/lib/reports";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (req.headers.get("x-ss-shop") !== "elton") return NextResponse.json({ reports: [] });
  return NextResponse.json({ reports: await listReports() });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const report = await addReport({
      body: String(body.body || ""),
      title: body.title,
      path: body.path,
      href: body.href,
      userAgent: body.userAgent,
      name: body.name,
      shopId: body.shopId,
    });
    return NextResponse.json(report);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 400 });
  }
}
