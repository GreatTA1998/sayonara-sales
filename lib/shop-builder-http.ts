import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { ShopBuilderError } from "./shop-builder";

export type Ctx = { db: import("firebase/firestore").Firestore; now: string };

function json(body: unknown, status: number) {
  const rev = body && typeof body === "object" && "rev" in (body as object)
    ? (body as { rev?: unknown }).rev : undefined;
  const headers = new Headers({
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  if (typeof rev === "number") headers.set("etag", `"${rev}"`);
  return new NextResponse(JSON.stringify(body), { status, headers });
}

function bearerOk(header: string | null, secret: string) {
  const presented = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  const a = Buffer.from(presented);
  const b = Buffer.from(secret);
  if (a.length !== b.length) {
    timingSafeEqual(b, b);
    return false;
  }
  return timingSafeEqual(a, b);
}

export function authorize(req: Request): Response | null {
  const secret = process.env.SHOP_BUILDER_API_TOKEN || "";
  if (!secret) return json({ error: "Not found" }, 404);
  if (!bearerOk(req.headers.get("authorization"), secret)) {
    return json({ error: "Unauthorized", code: "unauthorized" }, 401);
  }
  return null;
}

export function requireAgent(req: Request) {
  const id = (req.headers.get("x-agent-id") || "").trim();
  if (!/^[A-Za-z0-9._:-]{1,80}$/.test(id)) {
    throw new ShopBuilderError(400, "X-Agent-Id is required", { code: "validation" });
  }
  return id;
}

export function readIfMatch(req: Request): number | "*" | undefined {
  const h = req.headers.get("if-match");
  if (h == null || !h.trim()) return undefined;
  const s = h.trim();
  if (s === "*") return "*";
  const m = /^(?:W\/)?"(\d+)"$|^(\d+)$/.exec(s);
  if (!m) throw new ShopBuilderError(400, "If-Match must be a revision", { code: "validation" });
  return Number(m[1] || m[2]);
}

export function requireIfMatch(v: number | "*" | undefined): number | "*" {
  if (v == null) throw new ShopBuilderError(428, "If-Match is required", { code: "precondition_required" });
  return v;
}

export function wantsDry(req: Request, body?: unknown) {
  const q = new URL(req.url).searchParams.get("dryRun");
  if (q === "1" || q === "true") return true;
  return !!body && typeof body === "object" && !Array.isArray(body) && (body as { dryRun?: unknown }).dryRun === true;
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  const text = await req.text();
  if (!text.trim()) return {};
  try {
    const v = JSON.parse(text) as unknown;
    if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("object");
    return v as Record<string, unknown>;
  } catch {
    throw new ShopBuilderError(400, "Invalid JSON", { code: "validation" });
  }
}

export function ok(body: unknown, status = 200) {
  return json(body, status);
}

export function fail(e: unknown) {
  if (e instanceof ShopBuilderError) return json({ error: e.message, ...e.extra }, e.status);
  const code = String((e as { code?: string })?.code || "");
  if (code.includes("permission-denied")) {
    return json({
      error: "Firestore rejected the write. Deploy firestore.rules (unclaimed edits and shopSources).",
      code: "rules",
    }, 503);
  }
  if (e instanceof Error && e.message.includes("Firebase client config")) {
    return json({ error: e.message, code: "unavailable" }, 503);
  }
  console.error("shop-builder", e instanceof Error ? e.message : e);
  return json({ error: "Internal error", code: "internal" }, 500);
}

export async function handle(req: Request, fn: (ctx: Ctx & { req: Request }) => Promise<Response>) {
  const denied = authorize(req);
  if (denied) return denied;
  try {
    const { serverDb } = await import("./fb-server");
    const db = await serverDb();
    return await fn({ req, db, now: new Date().toISOString() });
  } catch (e) {
    return fail(e);
  }
}
