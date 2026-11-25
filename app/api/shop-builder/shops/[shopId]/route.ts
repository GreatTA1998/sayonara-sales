import { getShop } from "@/lib/shop-builder";
import { handle, ok } from "@/lib/shop-builder-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ shopId: string }> };

export async function GET(req: Request, ctx: Ctx) {
  return handle(req, async ({ db, now }) => {
    const { shopId } = await ctx.params;
    return ok(await getShop(db, shopId, now));
  });
}
