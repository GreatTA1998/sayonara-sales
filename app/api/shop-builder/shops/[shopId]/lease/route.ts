import { acquireLease, releaseLease } from "@/lib/shop-builder";
import { handle, ok, readIfMatch, readJson, requireAgent, requireIfMatch, wantsDry } from "@/lib/shop-builder-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ shopId: string }> };

export async function POST(req: Request, ctx: Ctx) {
  return handle(req, async ({ req: r, db, now }) => {
    const body = await readJson(r);
    const { shopId } = await ctx.params;
    const shop = await acquireLease(
      db,
      shopId,
      typeof body.seconds === "number" ? body.seconds : undefined,
      { agentId: requireAgent(r), ifMatch: requireIfMatch(readIfMatch(r)), now, dryRun: wantsDry(r, body) },
    );
    return ok(shop);
  });
}

export async function DELETE(req: Request, ctx: Ctx) {
  return handle(req, async ({ req: r, db, now }) => {
    const { shopId } = await ctx.params;
    const shop = await releaseLease(db, shopId, {
      agentId: requireAgent(r),
      ifMatch: requireIfMatch(readIfMatch(r)),
      now,
      dryRun: wantsDry(r),
    });
    return ok(shop);
  });
}
