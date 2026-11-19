import { promises as fs } from "fs";
import path from "path";
import { put, get } from "@vercel/blob";
import { isLateOnly, rangeLbl } from "./days";
import { LATE_FROM, PICKUP_DAYS, PICKUP_SLOTS } from "./sale";

export type Item = {
  id: string; name: string; price: number | null; note?: string; claimId?: string | null;
  photos?: string[]; availableFrom?: string; availableTo?: string;
};
export type Claim = {
  id: string; code: string; day: string; slot: string; itemIds: string[];
  /** Soft identity: typed LINE display name (buyer). */
  contact?: string; contactMethod?: "line" | "phone";
  status: "booked" | "picked_up" | "cancelled"; createdAt: string;
};
export type Store = { address: string; bio?: string; jimotyUrl?: string; items: Item[]; claims: Claim[] };

export { LATE_FROM, PICKUP_DAYS, PICKUP_SLOTS, isLateOnly };

export const setLateOnly = (it: Item, on: boolean) => {
  if (on) { it.availableFrom = LATE_FROM; delete it.availableTo; }
  else { delete it.availableFrom; delete it.availableTo; }
};

/** Elton keeps legacy blob key; others use sayonara-store-{id}.json */
export const ELTON_SHOP = "elton";
export const parseShop = (raw: string | null | undefined) => {
  const s = (raw || "").trim().toLowerCase();
  if (!s || s === ELTON_SHOP) return ELTON_SHOP;
  if (/^\d{5}$/.test(s)) return s;
  throw new Error("Bad shop");
};
export const shopFromUrl = (req: Request) => {
  try { return parseShop(new URL(req.url).searchParams.get("shop")); }
  catch { return ELTON_SHOP; }
};

const blobKey = (shop: string) =>
  shop === ELTON_SHOP ? "sayonara-store.json" : `sayonara-store-${shop}.json`;
const localPath = (shop: string) =>
  path.join(process.cwd(), "data", shop === ELTON_SHOP ? "store.json" : `store-${shop}.json`);

const eltonSeed = (): Store => ({
  address: "目黒区",
  items: [
    { id: "i1", name: "IKEA desk", price: 3000, photos: ["https://picsum.photos/seed/desk/600/400"] },
    { id: "i2", name: "Office chair", price: 2000, note: "slight wear" },
    { id: "i3", name: "Microwave", price: 1500 },
    { id: "i4", name: "Rice cooker", price: null },
    { id: "i5", name: "Floor lamp", price: 800 },
    { id: "i6", name: "Bookshelf", price: 1000, photos: ["https://picsum.photos/seed/shelf1/400/400", "https://picsum.photos/seed/shelf2/400/400"] },
    { id: "i7", name: "Hangers (set)", price: null },
    {
      id: "i8", name: "Small fridge", price: 5000, note: "needs cleaning",
      availableFrom: LATE_FROM,
      photos: ["https://picsum.photos/seed/fridge/600/400"],
    },
  ],
  claims: [],
});
const emptySeed = (): Store => ({ address: "目黒区", items: [], claims: [] });

const mem = new Map<string, Store>();
const chains = new Map<string, Promise<unknown>>();
const useBlob = () => !!process.env.BLOB_READ_WRITE_TOKEN;

async function readRaw(shop: string): Promise<Store> {
  if (useBlob()) {
    const res = await get(blobKey(shop), { access: "public" });
    if (!res) return shop === ELTON_SHOP ? eltonSeed() : emptySeed();
    return (await new Response(res.stream).json()) as Store;
  }
  try { return JSON.parse(await fs.readFile(localPath(shop), "utf8")) as Store; }
  catch {
    const s = shop === ELTON_SHOP ? eltonSeed() : emptySeed();
    await fs.mkdir(path.dirname(localPath(shop)), { recursive: true });
    await fs.writeFile(localPath(shop), JSON.stringify(s, null, 2));
    return s;
  }
}

async function writeRaw(shop: string, s: Store) {
  mem.set(shop, s);
  if (useBlob()) {
    await put(blobKey(shop), JSON.stringify(s), {
      access: "public", addRandomSuffix: false, allowOverwrite: true, contentType: "application/json",
    });
    return;
  }
  await fs.mkdir(path.dirname(localPath(shop)), { recursive: true });
  await fs.writeFile(localPath(shop), JSON.stringify(s, null, 2));
}

export function withStore<T>(shop: string, fn: (s: Store) => T | Promise<T>): Promise<T> {
  const key = parseShop(shop);
  const prev = chains.get(key) || Promise.resolve();
  const run = prev.then(async () => {
    const s = scrub(await readRaw(key));
    mem.set(key, s);
    const result = await fn(s);
    await writeRaw(key, s);
    return result;
  });
  chains.set(key, run.then(() => undefined, () => undefined));
  return run;
}

function scrub(s: Store) {
  delete (s as { capacity?: unknown }).capacity;
  for (const it of s.items) delete (it as { availableAfter?: string }).availableAfter;
  return s;
}

export async function getStore(shop: string = ELTON_SHOP): Promise<Store> {
  const key = parseShop(shop);
  if (!mem.has(key)) mem.set(key, scrub(await readRaw(key)));
  return structuredClone(mem.get(key)!);
}

export function takenSlots(s: Store, day: string): string[] {
  return s.claims.filter((c) => c.day === day && c.status === "booked" && c.slot).map((c) => c.slot);
}

export const uid = (p: string) => `${p}${Math.random().toString(36).slice(2, 8)}`;
export const shortCode = () => Math.random().toString(36).slice(2, 6).toUpperCase();

export function itemStatus(item: Item, day: string) {
  if (item.claimId) return { ok: false as const, reason: "予約済みです" };
  const bad = (item.availableFrom && day < item.availableFrom) || (item.availableTo && day > item.availableTo);
  if (bad) {
    const r = rangeLbl(item.availableFrom, item.availableTo);
    return { ok: false as const, reason: r ? `受け取りは${r}のみ` : "この日は受け取り不可" };
  }
  return { ok: true as const };
}
