import { NextResponse } from "next/server";
import { byPrice } from "@/lib/sale";
import { bookableDays, claimOf, getStore, itemFlags, shopContact, shopFromUrl, shopMoveOut, shopSlots, takenSlots } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const shop = shopFromUrl(req);
  const account = new URL(req.url).searchParams.get("account")?.trim() || "";
  const s = await getStore(shop);
  const days = bookableDays(s);
  const slots = shopSlots(s);
  const contact = shopContact(shop, s);
  const taken: Record<string, string[]> = {};
  for (const d of days) taken[d] = takenSlots(s, d);
  return NextResponse.json({
    shop, address: s.address, bio: s.bio || "", jimotyUrl: s.jimotyUrl || "", youtubeUrl: s.youtubeUrl || "",
    days, moveOut: shopMoveOut(s), slots, taken,
    waiting: account ? s.items.filter((it) => claimOf(s, it)?.waiters?.some((w) => w.account === account)).map((it) => it.id) : [],
    lineInviteUrl: contact.lineInviteUrl || null, phone: contact.phone || null,
    items: [...s.items].filter((i) => !i.paused).sort(byPrice("asc")).map((it) => {
      const { id, name, price, note, photos } = it;
      return { id, name, price, note, photos: photos || [], ...itemFlags(s, it) };
    }),
  });
}
