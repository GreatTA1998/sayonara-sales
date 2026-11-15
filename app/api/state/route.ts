import { NextResponse } from "next/server";
import { getStore, PICKUP_DAYS } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const s = await getStore();
  return NextResponse.json({
    address: s.address,
    capacity: s.capacity,
    days: PICKUP_DAYS,
    items: [...s.items]
      .sort((a, b) => (b.price ?? -1) - (a.price ?? -1))
      .map(({ id, name, price, note, availableFrom, availableTo, claimId, photos }) => ({
        id, name, price, note, availableFrom, availableTo, taken: !!claimId,
        photos: (photos || []).slice(0, 2),
      })),
  });
}
