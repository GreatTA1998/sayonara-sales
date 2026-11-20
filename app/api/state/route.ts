import { NextResponse } from "next/server";
import { byPrice } from "@/lib/sale";
import { getStore, isLateOnly, shopDays, shopFromUrl, shopMoveOut, shopSlots, takenSlots } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const shop = shopFromUrl(req);
  const s = await getStore(shop);
  const days = shopDays(s);
  const slots = shopSlots(s);
  const taken: Record<string, string[]> = {};
  for (const d of days) taken[d] = takenSlots(s, d);
  return NextResponse.json({
    shop,
    address: s.address,
    bio: s.bio || "",
    jimotyUrl: s.jimotyUrl || "",
    days,
    moveOut: shopMoveOut(s),
    slots,
    taken,
    lineInviteUrl: "https://line.me/ti/p/yBg2x2X_ut",
    // Client may re-sort via toggle; default = cheapest first, 0/unset last.
    items: [...s.items]
      .sort(byPrice("asc"))
      .map(({ id, name, price, note, availableFrom, availableTo, claimId, photos }) => ({
        id, name, price, note, availableFrom, availableTo, taken: !!claimId,
        lateOnly: isLateOnly({ availableFrom, availableTo }),
        photos: photos || [],
      })),
  });
}
