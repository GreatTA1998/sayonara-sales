import { NextResponse } from "next/server";
import { getStore, isLateOnly, PICKUP_DAYS, PICKUP_SLOTS, shopFromUrl, takenSlots } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const shop = shopFromUrl(req);
  const s = await getStore(shop);
  const taken: Record<string, string[]> = {};
  for (const d of PICKUP_DAYS) taken[d] = takenSlots(s, d);
  return NextResponse.json({
    shop,
    address: s.address,
    bio: s.bio || "",
    jimotyUrl: s.jimotyUrl || "",
    days: PICKUP_DAYS,
    slots: PICKUP_SLOTS,
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
