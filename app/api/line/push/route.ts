import { NextResponse } from "next/server";
import { dayLbl } from "@/lib/days";
import { linePushText, lineUidOk, pushLine, type LinePushKind } from "@/lib/line";

export const dynamic = "force-dynamic";

const KINDS = new Set<LinePushKind>(["confirm", "decline", "reschedule", "waitlist", "wait_open"]);

/** OA push — templates only; no-ops when LINE_CHANNEL_ACCESS_TOKEN unset. */
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: "bad json" }, { status: 400 }); }
  const to = String(body.to || "").trim();
  const kind = String(body.kind || "").trim() as LinePushKind;
  if (!lineUidOk(to) || !KINDS.has(kind)) {
    return NextResponse.json({ ok: false, error: "bad to/kind" }, { status: 400 });
  }
  const dayRaw = String(body.day || "").trim();
  const day = dayRaw ? dayLbl(dayRaw) : "";
  const slot = String(body.slot || "").trim();
  const code = String(body.code || "").trim().slice(0, 16);
  const reason = String(body.reason || "").trim().slice(0, 400);
  const result = await pushLine(to, linePushText(kind, { day, slot, code, reason }));
  return NextResponse.json(result);
}
