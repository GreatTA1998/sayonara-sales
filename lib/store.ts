import { promises as fs } from "fs";
import path from "path";
import { put, get } from "@vercel/blob";

export type Item = { id: string; name: string; price: number | null; note?: string; claimId?: string | null; photos?: string[]; availableFrom?: string; availableTo?: string };
export type Claim = { id: string; code: string; day: string; slot: string; itemIds: string[]; contact?: string; contactMethod?: "line" | "phone"; status: "booked" | "picked_up" | "cancelled"; createdAt: string };
export type Store = { address: string; items: Item[]; claims: Claim[] };

export const PICKUP_DAYS = [
  "2026-11-01","2026-11-02","2026-11-03","2026-11-04",
  "2026-11-05","2026-11-06","2026-11-07","2026-11-08",
];
export const PICKUP_SLOTS = ["10:00–10:15", "14:00–14:15", "20:00–20:15"];

const BLOB = "sayonara-store.json";
const LOCAL = path.join(process.cwd(), "data", "store.json");

const seed = (): Store => ({
  address: "目黒区",
  items: [
    { id: "i1", name: "IKEA desk", price: 3000, photos: ["https://picsum.photos/seed/desk/600/400"] },
    { id: "i2", name: "Office chair", price: 2000, note: "slight wear" },
    { id: "i3", name: "Microwave", price: 1500 },
    { id: "i4", name: "Rice cooker", price: null },
    { id: "i5", name: "Floor lamp", price: 800 },
    { id: "i6", name: "Bookshelf", price: 1000, photos: ["https://picsum.photos/seed/shelf1/400/400", "https://picsum.photos/seed/shelf2/400/400"] },
    { id: "i7", name: "Hangers (set)", price: null },
    { id: "i8", name: "Small fridge", price: 5000, note: "needs cleaning", photos: ["https://picsum.photos/seed/fridge/600/400"] },
  ],
  claims: [],
});

let mem: Store | null = null;
let chain: Promise<unknown> = Promise.resolve();
const useBlob = () => !!process.env.BLOB_READ_WRITE_TOKEN;

async function readRaw(): Promise<Store> {
  if (useBlob()) {
    // Public Blob store (needed so admin photo uploads are buyer-visible).
    const res = await get(BLOB, { access: "public" });
    if (!res) return seed();
    return (await new Response(res.stream).json()) as Store;
  }
  try { return JSON.parse(await fs.readFile(LOCAL, "utf8")) as Store; }
  catch {
    const s = seed();
    await fs.mkdir(path.dirname(LOCAL), { recursive: true });
    await fs.writeFile(LOCAL, JSON.stringify(s, null, 2));
    return s;
  }
}

async function writeRaw(s: Store) {
  mem = s;
  if (useBlob()) {
    await put(BLOB, JSON.stringify(s), {
      access: "public", addRandomSuffix: false, allowOverwrite: true, contentType: "application/json",
    });
    return;
  }
  await fs.mkdir(path.dirname(LOCAL), { recursive: true });
  await fs.writeFile(LOCAL, JSON.stringify(s, null, 2));
}

export function withStore<T>(fn: (s: Store) => T | Promise<T>): Promise<T> {
  const run = chain.then(async () => {
    const s = scrub(await readRaw());
    mem = s;
    const result = await fn(s);
    await writeRaw(s);
    return result;
  });
  chain = run.then(() => undefined, () => undefined);
  return run;
}

function scrub(s: Store) {
  delete (s as { capacity?: unknown }).capacity;
  for (const it of s.items) delete (it as { availableAfter?: string }).availableAfter;
  return s;
}
export async function getStore(): Promise<Store> {
  // Prefer in-memory store after writes so admin photo edits show without a reload race.
  if (!mem) mem = scrub(await readRaw());
  return structuredClone(mem!);
}

export function takenSlots(s: Store, day: string): string[] {
  return s.claims.filter((c) => c.day === day && c.status === "booked" && c.slot).map((c) => c.slot);
}

export const uid = (p: string) => `${p}${Math.random().toString(36).slice(2, 8)}`;
export const shortCode = () => Math.random().toString(36).slice(2, 6).toUpperCase();

export function rangeLbl(from?: string, to?: string) {
  if (!from && !to) return "";
  if (from && to && from.slice(0, 7) === to.slice(0, 7)) return `Nov ${Number(from.slice(8))}–${Number(to.slice(8))}`;
  if (from && to) return `Nov ${Number(from.slice(8))}–Nov ${Number(to.slice(8))}`;
  return from ? `from Nov ${Number(from.slice(8))}` : `until Nov ${Number(to!.slice(8))}`;
}

export function itemStatus(item: Item, day: string) {
  if (item.claimId) return { ok: false as const, reason: "Already booked — wait for cancel." };
  const bad = (item.availableFrom && day < item.availableFrom) || (item.availableTo && day > item.availableTo);
  if (bad) return { ok: false as const, reason: `Only available ${rangeLbl(item.availableFrom, item.availableTo)}.` };
  return { ok: true as const };
}
