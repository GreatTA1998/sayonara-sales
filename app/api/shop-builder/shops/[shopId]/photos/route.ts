import { savePhoto } from "@/lib/shop-builder";
import { handle, ok, readIfMatch, requireAgent, wantsDry } from "@/lib/shop-builder-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ shopId: string }> };

export async function POST(req: Request, ctx: Ctx) {
  return handle(req, async ({ req: r, db, now }) => {
    const { shopId } = await ctx.params;
    const shop = await savePhoto(db, shopId, r, {
      agentId: requireAgent(r),
      ifMatch: readIfMatch(r),
      now,
      dryRun: wantsDry(r),
    });
    return ok(shop);
  });
}
