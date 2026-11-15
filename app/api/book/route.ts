import { NextResponse } from "next/server";
import { PICKUP_DAYS, itemStatus, shortCode, uid, withStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json();
  const day = String(body.day || "");
  const itemIds: string[] = Array.isArray(body.itemIds) ? body.itemIds.map(String) : [];
  if (!PICKUP_DAYS.includes(day) || !itemIds.length)
    return NextResponse.json({ error: "Invalid day or items" }, { status: 400 });
  try {
    const result = await withStore((s) => {
      const used = s.claims.filter((c) => c.day === day && c.status === "booked").length;
      if (used >= (s.capacity[day] ?? 20)) throw new Error("That day is full");
      for (const id of itemIds) {
        const item = s.items.find((i) => i.id === id);
        if (!item) throw new Error("Item missing");
        const st = itemStatus(item, day);
        if (!st.ok) throw new Error(`${item.name}: ${st.reason}`);
      }
      const claim = { id: uid("c"), code: shortCode(), day, itemIds: [...itemIds], status: "booked" as const, createdAt: new Date().toISOString() };
      for (const id of itemIds) s.items.find((i) => i.id === id)!.claimId = claim.id;
      s.claims.unshift(claim);
      return { code: claim.code, day, address: s.address, items: itemIds.map((id) => s.items.find((i) => i.id === id)!.name) };
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 409 });
  }
}
