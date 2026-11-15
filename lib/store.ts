import { promises as fs } from "fs";
import path from "path";
import { put, get } from "@vercel/blob";

export type Item = { id: string; name: string; price: number | null; note?: string; availableAfter?: string; claimId?: string | null; photos?: string[] };
export type Claim = { id: string; code: string; day: string; itemIds: string[]; status: "booked" | "picked_up" | "cancelled"; createdAt: string };
export type Store = { address: string; capacity: Record<string, number>; items: Item[]; claims: Claim[] };

export const PICKUP_DAYS = [
  "2026-11-01","2026-11-02","2026-11-03","2026-11-04",
  "2026-11-05","2026-11-06","2026-11-07","2026-11-08",
];

const BLOB = "sayonara-store.json";
const LOCAL = path.join(process.cwd(), "data", "store.json");

const seed = (): Store => ({
  address: "Shibuya (approx. neighborhood)",
  capacity: Object.fromEntries(PICKUP_DAYS.map((d) => [d, 20])),
  items: [
    { id: "i1", name: "IKEA desk", price: 3000, photos: ["https://picsum.photos/seed/desk/600/400"] },
    { id: "i2", name: "Office chair", price: 2000, note: "slight wear" },
    { id: "i3", name: "Microwave", price: 1500 },
    { id: "i4", name: "Rice cooker", price: null },
    { id: "i5", name: "Floor lamp", price: 800, availableAfter: "2026-11-04" },
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
    const res = await get(BLOB, { access: "private" });
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
      access: "private", addRandomSuffix: false, allowOverwrite: true, contentType: "application/json",
    });
    return;
  }
  await fs.mkdir(path.dirname(LOCAL), { recursive: true });
  await fs.writeFile(LOCAL, JSON.stringify(s, null, 2));
}

export function withStore<T>(fn: (s: Store) => T | Promise<T>): Promise<T> {
  const run = chain.then(async () => {
    const s = await readRaw();
    mem = s;
    const result = await fn(s);
    await writeRaw(s);
    return result;
  });
  chain = run.then(() => undefined, () => undefined);
  return run;
}

export async function getStore(): Promise<Store> {
  if (useBlob() || !mem) mem = await readRaw();
  return structuredClone(mem!);
}

export const uid = (p: string) => `${p}${Math.random().toString(36).slice(2, 8)}`;
export const shortCode = () => Math.random().toString(36).slice(2, 6).toUpperCase();

export function itemStatus(item: Item, day: string) {
  if (item.claimId) return { ok: false as const, reason: "Already booked — wait for cancel." };
  if (item.availableAfter && day < item.availableAfter)
    return { ok: false as const, reason: `Only available after ${item.availableAfter.slice(5).replace("-", "/")}.` };
  return { ok: true as const };
}
