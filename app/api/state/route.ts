import { NextResponse } from "next/server";
import { getStore, PICKUP_DAYS, PICKUP_SLOTS, takenSlots } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const s = await getStore();
  const taken: Record<string, string[]> = {};
  for (const d of PICKUP_DAYS) taken[d] = takenSlots(s, d);
  const lineInviteUrl = (process.env.LINE_INVITE_URL || "https://line.me/ti/p/yBg2x2X_ut").trim();
  return NextResponse.json({
    address: s.address,
    capacity: s.capacity,
    days: PICKUP_DAYS,
    slots: PICKUP_SLOTS,
    taken,
    lineInviteUrl,
    items: [...s.items]
      .sort((a, b) => (b.price ?? -1) - (a.price ?? -1))
      .map(({ id, name, price, note, availableFrom, availableTo, claimId, photos }) => ({
        id, name, price, note, availableFrom, availableTo, taken: !!claimId,
        photos: photos || [],
      })),
  });
}
