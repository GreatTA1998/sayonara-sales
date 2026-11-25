import { handle, ok, readJson, readIfMatch, requireAgent, wantsDry } from "@/lib/shop-builder-http";
import { listShops, upsertShop } from "@/lib/shop-builder";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handle(req, async ({ db, now }) => {
    const q = new URL(req.url).searchParams;
    const limit = q.get("limit");
    const shops = await listShops(db, {
      source: q.get("source") || undefined,
      sellerId: q.get("sellerId") || undefined,
      lease: q.get("lease") || undefined,
      limit: limit ? Number(limit) : undefined,
    }, now);
    return ok(shops);
  });
}

export async function POST(req: Request) {
  return handle(req, async ({ req: r, db, now }) => {
    const body = await readJson(r);
    const dryRun = wantsDry(r, body);
    const agentId = requireAgent(r);
    const shop = await upsertShop(db, body, { agentId, ifMatch: readIfMatch(r), now, dryRun });
    return ok(shop);
  });
}
