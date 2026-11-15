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
          if ("availableFrom" in body) item.availableFrom = body.availableFrom || undefined;
          if ("availableTo" in body) item.availableTo = body.availableTo || undefined;
          if ("photos" in body) item.photos = Array.isArray(body.photos) ? body.photos.map(String).filter(Boolean) : undefined;
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
        case "cancel":
        case "release": {
          const keep = body.action === "release" ? String(body.keepId || "") : "";
          const ids = body.action === "cancel" ? [String(body.id)] : s.claims.filter((c) => c.status === "booked" && c.id !== keep).map((c) => c.id);
          let n = 0;
          for (const id of ids) {
            const c = s.claims.find((x) => x.id === id);
            if (!c || c.status !== "booked") { if (body.action === "cancel") throw new Error("No claim"); continue; }
            c.status = "cancelled"; n++;
            for (const iid of c.itemIds) { const it = s.items.find((i) => i.id === iid); if (it?.claimId === c.id) it.claimId = null; }
          }
          return body.action === "cancel" ? s.claims.find((c) => c.id === body.id) : { released: n };
        }
        case "picked_up": {
          const claim = s.claims.find((c) => c.id === body.id);
          if (!claim || claim.status !== "booked") throw new Error("No claim");
          claim.status = "picked_up"; return claim;
        }
        case "restore": {
          const store = body.store as { address?: string; capacity?: Record<string, number>; items?: unknown[]; claims?: unknown[] } | undefined;
          if (!store || !Array.isArray(store.items) || !Array.isArray(store.claims)) throw new Error("Bad store");
          s.address = String(store.address || s.address);
          if (store.capacity && typeof store.capacity === "object") s.capacity = store.capacity as typeof s.capacity;
          s.items = store.items as typeof s.items;
          s.claims = store.claims as typeof s.claims;
          return { ok: true, items: s.items.length, claims: s.claims.length };
        }
        default: throw new Error("Unknown action");
      }
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 400 });
  }
}
