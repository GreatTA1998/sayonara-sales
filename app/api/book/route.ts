import { NextResponse } from "next/server";
import { PICKUP_DAYS, PICKUP_SLOTS, itemStatus, shortCode, takenSlots, uid, withStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json();
  const day = String(body.day || "");
  const slot = String(body.slot || "");
  const contactMethod = body.contactMethod === "phone" ? "phone" as const : body.contactMethod === "line" ? "line" as const : undefined;
  const contact = String(body.contact || "").trim() || undefined;
  const itemIds: string[] = Array.isArray(body.itemIds) ? body.itemIds.map(String) : [];
  if (!PICKUP_DAYS.includes(day) || !PICKUP_SLOTS.includes(slot) || !itemIds.length || !contactMethod)
    return NextResponse.json({ error: "日付・時間・連絡方法・品目を確認してください" }, { status: 400 });
  if (contactMethod === "phone" && !contact)
    return NextResponse.json({ error: "電話番号を入力してください" }, { status: 400 });
  try {
    const result = await withStore((s) => {
      if (takenSlots(s, day).includes(slot)) throw new Error("その時間帯は埋まっています");
      const used = s.claims.filter((c) => c.day === day && c.status === "booked").length;
      if (used >= (s.capacity[day] ?? 20)) throw new Error("その日は満員です");
      for (const id of itemIds) {
        const item = s.items.find((i) => i.id === id);
        if (!item) throw new Error("品目が見つかりません");
        const st = itemStatus(item, day);
        if (!st.ok) throw new Error(`${item.name}: ${st.reason}`);
      }
      const claim = {
        id: uid("c"), code: shortCode(), day, slot, itemIds: [...itemIds],
        contactMethod, contact: contactMethod === "line" ? "LINE" : contact,
        status: "booked" as const, createdAt: new Date().toISOString(),
      };
      for (const id of itemIds) s.items.find((i) => i.id === id)!.claimId = claim.id;
      s.claims.unshift(claim);
      const total = itemIds.reduce((n, id) => n + (s.items.find((i) => i.id === id)!.price ?? 0), 0);
      return {
        code: claim.code, day, slot, address: s.address, contact: claim.contact, contactMethod,
        total, items: itemIds.map((id) => s.items.find((i) => i.id === id)!.name),
      };
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "失敗しました" }, { status: 409 });
  }
}
