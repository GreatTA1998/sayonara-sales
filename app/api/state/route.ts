import { NextResponse } from "next/server";
import { getStore, PICKUP_DAYS } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const s = await getStore();
  return NextResponse.json({
    address: s.address,
    capacity: s.capacity,
    days: PICKUP_DAYS,
    items: s.items.map(({ id, name, price, note, availableAfter, claimId }) => ({
      id,
      name,
      price,
      note,
      availableAfter,
      taken: !!claimId,
    })),
  });
}
