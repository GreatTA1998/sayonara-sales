import { promises as fs } from "fs";
import path from "path";
import { put, get, head, BlobNotFoundError, BlobPreconditionFailedError } from "@vercel/blob";
import { daysBetween } from "./days";
import { CANON_LINE, CANON_PHONE, PICKUP_DAYS, PICKUP_SLOTS, ytUrl } from "./sale";
export { CANON_LINE, CANON_PHONE, telHref, ytUrl } from "./sale";

export type Item = {
  id: string; name: string; price: number | null; note?: string; claimId?: string | null;
  photos?: string[]; /** Seller pause — hidden from buyer shop, not claimable. */
  paused?: boolean;
};
export type Claim = {
  id: string; code: string; day: string; slot: string; itemIds: string[];
  /** Soft identity: typed LINE display name (buyer). */
  contact?: string; contactMethod?: "line" | "phone";
  status: "booked" | "picked_up" | "cancelled"; createdAt: string;
};
export type Store = {
  address: string; bio?: string; jimotyUrl?: string; youtubeUrl?: string;
  lineInviteUrl?: string; phone?: string;
  /** Custom pickup windows; omit → PICKUP_SLOTS defaults. */
  slots?: string[];
  /** Pickup range + final move-out (YYYY-MM-DD); omit → PICKUP_DAYS defaults. */
  pickupFrom?: string; pickupTo?: string; moveOut?: string;
  /** Once true, admin CTA stays URLコピー (not 公開する). Elton defaults published. */
  published?: boolean;
  items: Item[]; claims: Claim[];
};

export const shopPublished = (shop: string, s: Store) =>
  !!s.published || shop === ELTON_SHOP;

/** Resolved buyer contact for a shop (Elton falls back to canonical). */
export function shopContact(shop: string, s: Store) {
  const line = (s.lineInviteUrl || "").trim();
  const phone = (s.phone || "").trim();
  if (line || phone) return { lineInviteUrl: line, phone };
  if (shop === ELTON_SHOP) return { lineInviteUrl: CANON_LINE, phone: CANON_PHONE };
  return { lineInviteUrl: "", phone: "" };
}

export const hasBuyerContact = (shop: string, s: Store) => {
  const c = shopContact(shop, s);
  return !!(c.lineInviteUrl || c.phone);
};

export { PICKUP_DAYS, PICKUP_SLOTS };

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const asYmd = (v: unknown) => { const s = String(v || "").trim(); return YMD.test(s) ? s : ""; };

/** Shop's offerable slots (custom or defaults). */
export const shopSlots = (s: Store) => (s.slots?.length ? s.slots : [...PICKUP_SLOTS]);

/** Shop pickup days (custom range or defaults). */
export const shopDays = (s: Store) => {
  const days = daysBetween(s.pickupFrom || PICKUP_DAYS[0], s.pickupTo || PICKUP_DAYS[PICKUP_DAYS.length - 1]);
  return days.length ? days : [...PICKUP_DAYS];
};

export const shopMoveOut = (s: Store) => s.moveOut || s.pickupTo || PICKUP_DAYS[PICKUP_DAYS.length - 1];

/** Normalize admin slot labels (en dash, trim, dedupe). */
export function normalizeSlots(raw: unknown): string[] {
  if (!Array.isArray(raw)) throw new Error("時間帯が不正です");
  const out = [...new Set(
    raw.map((x) => String(x).trim().replace(/\s*[-–—]\s*/g, "–")).filter(Boolean),
  )];
  if (!out.length) throw new Error("時間帯を1つ以上指定してください");
  return out;
}

/** Persist pickup range + move-out; returns normalized fields. */
export function applyDates(s: Store, raw: { pickupFrom?: unknown; pickupTo?: unknown; moveOut?: unknown }) {
  const from = asYmd(raw.pickupFrom) || s.pickupFrom || PICKUP_DAYS[0];
  const to = asYmd(raw.pickupTo) || s.pickupTo || PICKUP_DAYS[PICKUP_DAYS.length - 1];
  if (to < from) throw new Error("退去日は開始以降にしてください");
  if (!daysBetween(from, to).length) throw new Error("受取日が不正です");
  s.pickupFrom = from;
  s.pickupTo = to;
  // End/departure are one field in admin; keep Blob moveOut in sync with pickupTo.
  s.moveOut = asYmd(raw.moveOut) || to;
  return { pickupFrom: s.pickupFrom, pickupTo: s.pickupTo, moveOut: s.moveOut };
}

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
  lineInviteUrl: CANON_LINE,
  phone: CANON_PHONE,
  items: [
    { id: "i1", name: "IKEA desk", price: 3000, photos: ["https://picsum.photos/seed/desk/600/400"] },
    { id: "i2", name: "Office chair", price: 2000, note: "slight wear" },
    { id: "i3", name: "Microwave", price: 1500 },
    { id: "i4", name: "Rice cooker", price: null },
    { id: "i5", name: "Floor lamp", price: 800 },
    { id: "i6", name: "Bookshelf", price: 1000, photos: ["https://picsum.photos/seed/shelf1/400/400", "https://picsum.photos/seed/shelf2/400/400"] },
    { id: "i7", name: "Hangers (set)", price: null },
    { id: "i8", name: "Small fridge", price: 5000, note: "needs cleaning",
      photos: ["https://picsum.photos/seed/fridge/600/400"] },
  ],
  claims: [],
});
const emptySeed = (): Store => ({ address: "目黒区", items: [], claims: [] });
const seedFor = (shop: string) => (shop === ELTON_SHOP ? eltonSeed() : emptySeed());

/** In-process write queue (one serverless instance). Cross-instance safety = etag ifMatch. */
const chains = new Map<string, Promise<unknown>>();
const useBlob = () => !!process.env.BLOB_READ_WRITE_TOKEN;
const CAS_TRIES = 8;

type Snap = { store: Store; etag?: string };

async function readBlob(key: string, shop: string): Promise<Snap> {
  // Prefer private + uncached origin read (store JSON is never a public asset).
  const priv = await get(key, { access: "private", useCache: false });
  if (priv?.statusCode === 200 && priv.stream) {
    return { store: (await new Response(priv.stream).json()) as Store, etag: priv.blob.etag };
  }
  // Legacy public blob: head() for a fresh etag, body via cache-bust (CDN max-age was 30d).
  try {
    const meta = await head(key);
    const url = new URL(meta.url);
    url.searchParams.set("cache", "0");
    const res = await fetch(url, { cache: "no-store", headers: { "Cache-Control": "no-cache" } });
    if (res.ok) return { store: (await res.json()) as Store, etag: meta.etag };
  } catch (e) {
    if (!(e instanceof BlobNotFoundError)) throw e;
  }
  return { store: seedFor(shop) };
}

async function readRaw(shop: string): Promise<Snap> {
  if (useBlob()) return readBlob(blobKey(shop), shop);
  try {
    return { store: JSON.parse(await fs.readFile(localPath(shop), "utf8")) as Store };
  } catch {
    const store = seedFor(shop);
    await fs.mkdir(path.dirname(localPath(shop)), { recursive: true });
    await fs.writeFile(localPath(shop), JSON.stringify(store, null, 2));
    return { store };
  }
}

async function writeRaw(shop: string, s: Store, etag?: string) {
  if (useBlob()) {
    await put(blobKey(shop), JSON.stringify(s), {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
      // Min CDN TTL; private+useCache:false is the real consistency path.
      cacheControlMaxAge: 60,
      ...(etag ? { ifMatch: etag } : {}),
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
    let last: unknown;
    for (let i = 0; i < CAS_TRIES; i++) {
      const { store, etag } = await readRaw(key);
      const s = scrub(store);
      const result = await fn(s);
      try {
        await writeRaw(key, s, etag);
        return result;
      } catch (e) {
        if (e instanceof BlobPreconditionFailedError) { last = e; continue; }
        throw e;
      }
    }
    throw last instanceof Error ? last : new Error("Store write conflict");
  });
  chains.set(key, run.then(() => undefined, () => undefined));
  return run;
}

function scrub(s: Store) {
  delete (s as { capacity?: unknown }).capacity;
  for (const it of s.items) {
    const raw = it as Item & { availableAfter?: string; availableFrom?: string; availableTo?: string; lateOnly?: boolean };
    delete raw.availableAfter;
    delete raw.availableFrom;
    delete raw.availableTo;
    delete raw.lateOnly;
    if (!it.paused) delete it.paused;
  }
  if (!(s.youtubeUrl || "").trim()) {
    const y = ytUrl(s.bio || "");
    if (y) s.youtubeUrl = y;
  }
  return s;
}

/** Always re-read — no per-instance GET cache (stale snapshots caused lost admin writes). */
export async function getStore(shop: string = ELTON_SHOP): Promise<Store> {
  const key = parseShop(shop);
  const { store } = await readRaw(key);
  return structuredClone(scrub(store));
}

/** Occupied by pending request or confirmed/done booking (not cancelled). */
export function takenSlots(s: Store, day: string): string[] {
  return s.claims
    .filter((c) => c.day === day && c.status !== "cancelled" && c.slot)
    .map((c) => c.slot);
}

export const uid = (p: string) => `${p}${Math.random().toString(36).slice(2, 8)}`;
export const shortCode = () => Math.random().toString(36).slice(2, 6).toUpperCase();

export function itemStatus(item: Item) {
  if (item.paused) return { ok: false as const, reason: "一時停止中" };
  if (item.claimId) return { ok: false as const, reason: "予約済みです" };
  return { ok: true as const };
}
