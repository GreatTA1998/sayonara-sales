import { NextResponse } from "next/server";
import { checkAdmin } from "@/lib/auth";
import { PICKUP_DAYS, getStore, uid, withStore } from "@/lib/store";

export const dynamic = "force-dynamic";
const unauth = () => NextResponse.json({ error: "Unauthorized" }, { status: 401 });
const numOrNull = (v: unknown) =>
  v === "" || v == null || Number.isNaN(Number(v)) ? null : Number(v);

export async function GET(req: Request) {
  if (!checkAdmin(req.headers.get("x-admin-password"))) return unauth();
  return NextResponse.json({ ...(await getStore()), days: PICKUP_DAYS });
}

export async function POST(req: Request) {
  const body = await req.json();
  if (!checkAdmin(body.password)) return unauth();
  try {
    const result = await withStore((s) => {
      switch (body.action as string) {
        case "add": {
          const item = { id: uid("i"), name: String(body.name || "").trim(), price: numOrNull(body.price), note: body.note ? String(body.note) : undefined };
          if (!item.name) throw new Error("Name required");
          s.items.push(item); return item;
        }
        case "edit": {
          const item = s.items.find((i) => i.id === body.id);
          if (!item) throw new Error("Not found");
          if (body.name != null) item.name = String(body.name).trim();
          if ("price" in body) item.price = numOrNull(body.price);
          if ("note" in body) item.note = body.note ? String(body.note) : undefined;
          if ("availableAfter" in body) item.availableAfter = body.availableAfter || undefined;
          return item;
        }
        case "remove":
          s.items = s.items.filter((i) => i.id !== body.id); return { ok: true };
        case "address":
          s.address = String(body.address || "").trim(); return { address: s.address };
        case "capacity": {
          const day = String(body.day);
          if (!PICKUP_DAYS.includes(day)) throw new Error("Bad day");
          s.capacity[day] = Math.max(0, Number(body.limit) || 0); return { capacity: s.capacity };
        }
        case "cancel": {
          const claim = s.claims.find((c) => c.id === body.id);
          if (!claim || claim.status !== "booked") throw new Error("No claim");
          claim.status = "cancelled";
          for (const id of claim.itemIds) {
            const item = s.items.find((i) => i.id === id);
            if (item && item.claimId === claim.id) item.claimId = null;
          }
          return claim;
        }
        case "picked_up": {
          const claim = s.claims.find((c) => c.id === body.id);
          if (!claim || claim.status !== "booked") throw new Error("No claim");
          claim.status = "picked_up"; return claim;
        }
        default: throw new Error("Unknown action");
      }
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 400 });
  }
}
