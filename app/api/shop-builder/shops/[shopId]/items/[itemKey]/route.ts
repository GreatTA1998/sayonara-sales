import { deleteItem, putItem } from "@/lib/shop-builder";
import { handle, ok, readIfMatch, readJson, requireAgent, requireIfMatch, wantsDry } from "@/lib/shop-builder-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ shopId: string; itemKey: string }> };

export async function PUT(req: Request, ctx: Ctx) {
  return handle(req, async ({ req: r, db, now }) => {
    const body = await readJson(r);
    const { shopId, itemKey } = await ctx.params;
    const shop = await putItem(db, shopId, itemKey, body, {
      agentId: requireAgent(r),
      ifMatch: requireIfMatch(readIfMatch(r)),
      now,
      dryRun: wantsDry(r, body),
    });
    return ok(shop);
  });
}

export async function DELETE(req: Request, ctx: Ctx) {
  return handle(req, async ({ req: r, db, now }) => {
    const { shopId, itemKey } = await ctx.params;
    const shop = await deleteItem(db, shopId, itemKey, {
      agentId: requireAgent(r),
      ifMatch: requireIfMatch(readIfMatch(r)),
      now,
      dryRun: wantsDry(r),
    });
    return ok(shop);
  });
}
