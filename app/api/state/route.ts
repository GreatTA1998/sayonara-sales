import { NextResponse } from "next/server";
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
    items: [...s.items]
      .sort((a, b) => (b.price ?? -1) - (a.price ?? -1))
      .map(({ id, name, price, note, availableFrom, availableTo, claimId, photos }) => ({
        id, name, price, note, availableFrom, availableTo, taken: !!claimId,
        lateOnly: isLateOnly({ availableFrom, availableTo }),
        photos: photos || [],
      })),
  });
}
