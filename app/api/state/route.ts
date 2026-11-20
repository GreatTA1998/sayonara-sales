import { NextResponse } from "next/server";
import { byPrice } from "@/lib/sale";
import { getStore, isLateOnly, shopContact, shopDays, shopFromUrl, shopMoveOut, shopSlots, takenSlots } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const shop = shopFromUrl(req);
  const s = await getStore(shop);
  const days = shopDays(s);
  const slots = shopSlots(s);
  const contact = shopContact(shop, s);
  const taken: Record<string, string[]> = {};
  for (const d of days) taken[d] = takenSlots(s, d);
  return NextResponse.json({
    shop,
    address: s.address,
    bio: s.bio || "",
    jimotyUrl: s.jimotyUrl || "",
    youtubeUrl: s.youtubeUrl || "",
    days,
    moveOut: shopMoveOut(s),
    slots,
    taken,
    lineInviteUrl: contact.lineInviteUrl || null,
    phone: contact.phone || null,
    // Client may re-sort via toggle; default = cheapest first, unset/null last (¥0 is real).
    items: [...s.items]
      .sort(byPrice("asc"))
      .map(({ id, name, price, note, availableFrom, availableTo, claimId, photos }) => ({
        id, name, price, note, availableFrom, availableTo, taken: !!claimId,
        lateOnly: isLateOnly({ availableFrom, availableTo }),
        photos: photos || [],
      })),
  });
}
