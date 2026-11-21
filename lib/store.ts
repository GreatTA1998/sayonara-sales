import { daysBetween } from "./days";
import { fsCommit, fsGet, fsList, type FsWrite } from "./fb";
import { CANON_LINE, CANON_PHONE, PICKUP_DAYS, PICKUP_SLOTS, ytUrl } from "./sale";
export { CANON_LINE, CANON_PHONE, telHref, ytUrl } from "./sale";

export type Item = {
  id: string; name: string; price: number | null; note?: string; claimId?: string | null;
  photos?: string[]; paused?: boolean;
};
export type Claim = {
  id: string; code: string; day: string; slot: string; itemIds: string[];
  contact?: string; contactMethod?: "line" | "phone";
  status: "booked" | "picked_up" | "cancelled"; createdAt: string;
};
export type Store = {
  address: string; bio?: string; jimotyUrl?: string; youtubeUrl?: string;
  lineInviteUrl?: string; phone?: string;
  slots?: string[]; pickupFrom?: string; pickupTo?: string; moveOut?: string;
  published?: boolean; items: Item[]; claims: Claim[];
};

export const ELTON_SHOP = "elton";
export const shopPublished = (shop: string, s: Store) => !!s.published || shop === ELTON_SHOP;
export function shopContact(shop: string, s: Store) {
  const line = (s.lineInviteUrl || "").trim(), phone = (s.phone || "").trim();
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
export const shopSlots = (s: Store) => (s.slots?.length ? s.slots : [...PICKUP_SLOTS]);
export const shopDays = (s: Store) => {
  const days = daysBetween(s.pickupFrom || PICKUP_DAYS[0], s.pickupTo || PICKUP_DAYS[PICKUP_DAYS.length - 1]);
  return days.length ? days : [...PICKUP_DAYS];
};
export const shopMoveOut = (s: Store) => s.moveOut || s.pickupTo || PICKUP_DAYS[PICKUP_DAYS.length - 1];
export function normalizeSlots(raw: unknown): string[] {
  if (!Array.isArray(raw)) throw new Error("時間帯が不正です");
  const out = [...new Set(raw.map((x) => String(x).trim().replace(/\s*[-–—]\s*/g, "–")).filter(Boolean))];
  if (!out.length) throw new Error("時間帯を1つ以上指定してください");
  return out;
}
export function applyDates(s: Store, raw: { pickupFrom?: unknown; pickupTo?: unknown; moveOut?: unknown }) {
  const from = asYmd(raw.pickupFrom) || s.pickupFrom || PICKUP_DAYS[0];
  const to = asYmd(raw.pickupTo) || s.pickupTo || PICKUP_DAYS[PICKUP_DAYS.length - 1];
  if (to < from) throw new Error("退去日は開始以降にしてください");
  if (!daysBetween(from, to).length) throw new Error("受取日が不正です");
  s.pickupFrom = from; s.pickupTo = to; s.moveOut = asYmd(raw.moveOut) || to;
  return { pickupFrom: s.pickupFrom, pickupTo: s.pickupTo, moveOut: s.moveOut };
}
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

const j = (v: unknown) => JSON.stringify(v);
const chains = new Map<string, Promise<unknown>>();
const empty = (): Store => ({ address: "目黒区", items: [], claims: [] });
const seed = (id: string): Store =>
  id === ELTON_SHOP ? { ...empty(), lineInviteUrl: CANON_LINE, phone: CANON_PHONE } : empty();

type ShopDoc = Record<string, unknown>;
const shopDoc = (s: Store): ShopDoc => ({
  address: s.address || "", bio: s.bio || "", jimotyUrl: s.jimotyUrl || "",
  youtubeUrl: s.youtubeUrl || "", lineInviteUrl: s.lineInviteUrl || "", phone: s.phone || "",
  slots: s.slots?.length ? s.slots : [], pickupFrom: s.pickupFrom || "",
  pickupTo: s.pickupTo || "", moveOut: s.moveOut || "", published: !!s.published,
});
const itemDoc = (it: Item, pos: number) => ({
  name: it.name, price: it.price, note: it.note || null, claimId: it.claimId || null,
  photos: it.photos || [], paused: !!it.paused, pos,
});
const claimDoc = (c: Claim) => ({
  code: c.code, day: c.day, slot: c.slot || null, itemIds: c.itemIds || [],
  contact: c.contact || null, contactMethod: c.contactMethod || null,
  status: c.status, createdAt: c.createdAt,
});

function fromDocs(shop: ShopDoc, items: { id: string; data: Record<string, unknown> }[], claims: { id: string; data: Record<string, unknown> }[]): Store {
  const s: Store = {
    address: String(shop.address || ""),
    items: [...items].sort((a, b) => Number(a.data.pos || 0) - Number(b.data.pos || 0)).map(({ id, data: r }) => {
      const it: Item = { id, name: String(r.name || ""), price: r.price == null ? null : Number(r.price) };
      if (r.note) it.note = String(r.note);
      if (r.claimId) it.claimId = String(r.claimId);
      if (Array.isArray(r.photos) && r.photos.length) it.photos = r.photos.map(String);
      if (r.paused) it.paused = true;
      return it;
    }),
    claims: [...claims].sort((a, b) => String(b.data.createdAt || "").localeCompare(String(a.data.createdAt || ""))).map(({ id, data: r }) => {
      const c: Claim = {
        id, code: String(r.code || ""), day: String(r.day || ""), slot: String(r.slot || ""),
        itemIds: Array.isArray(r.itemIds) ? r.itemIds.map(String) : [],
        status: r.status as Claim["status"], createdAt: String(r.createdAt || ""),
      };
      if (r.contact) c.contact = String(r.contact);
      if (r.contactMethod) c.contactMethod = r.contactMethod as Claim["contactMethod"];
      return c;
    }),
  };
  if (shop.bio) s.bio = String(shop.bio);
  if (shop.jimotyUrl) s.jimotyUrl = String(shop.jimotyUrl);
  if (shop.youtubeUrl) s.youtubeUrl = String(shop.youtubeUrl);
  if (shop.lineInviteUrl) s.lineInviteUrl = String(shop.lineInviteUrl);
  if (shop.phone) s.phone = String(shop.phone);
  if (Array.isArray(shop.slots) && shop.slots.length) s.slots = shop.slots.map(String);
  if (shop.pickupFrom) s.pickupFrom = String(shop.pickupFrom);
  if (shop.pickupTo) s.pickupTo = String(shop.pickupTo);
  if (shop.moveOut) s.moveOut = String(shop.moveOut);
  if (shop.published) s.published = true;
  if (!(s.youtubeUrl || "").trim()) { const y = ytUrl(s.bio || ""); if (y) s.youtubeUrl = y; }
  return s;
}

async function load(id: string): Promise<Store> {
  const snap = await fsGet(`shops/${id}`);
  if (!snap) {
    const s = seed(id);
    await fsCommit([{ set: { path: `shops/${id}`, data: { ...shopDoc(s), updatedAt: new Date().toISOString() } } }]);
    return s;
  }
  const [items, claims] = await Promise.all([
    fsList(`shops/${id}/items`),
    fsList(`shops/${id}/claims`),
  ]);
  return fromDocs(snap.data, items, claims);
}

/** Granular persist — only changed docs (concurrent item edits don't clobber). */
async function persist(shop: string, before: Store, after: Store) {
  const writes: FsWrite[] = [];
  const aShop = shopDoc(after);
  if (j(shopDoc(before)) !== j(aShop)) {
    writes.push({ set: { path: `shops/${shop}`, data: { ...aShop, updatedAt: new Date().toISOString() }, merge: true } });
  }
  const bI = new Map(before.items.map((it, i) => [it.id, itemDoc(it, i)]));
  const aIds = new Set(after.items.map((it) => it.id));
  for (const id of bI.keys()) {
    if (!aIds.has(id)) writes.push({ delete: `shops/${shop}/items/${id}` });
  }
  after.items.forEach((it, i) => {
    const row = itemDoc(it, i);
    if (j(bI.get(it.id)) !== j(row)) writes.push({ set: { path: `shops/${shop}/items/${it.id}`, data: row } });
  });
  const bC = new Map(before.claims.map((c) => [c.id, claimDoc(c)]));
  const aCids = new Set(after.claims.map((c) => c.id));
  for (const id of bC.keys()) {
    if (!aCids.has(id)) writes.push({ delete: `shops/${shop}/claims/${id}` });
  }
  for (const c of after.claims) {
    const row = claimDoc(c);
    if (j(bC.get(c.id)) !== j(row)) writes.push({ set: { path: `shops/${shop}/claims/${c.id}`, data: row } });
  }
  await fsCommit(writes);
}

export function withStore<T>(shop: string, fn: (s: Store) => T | Promise<T>): Promise<T> {
  const key = parseShop(shop);
  const prev = chains.get(key) || Promise.resolve();
  const run = prev.then(async () => {
    const before = await load(key);
    const s = structuredClone(before);
    const result = await fn(s);
    await persist(key, before, s);
    return result;
  });
  chains.set(key, run.then(() => undefined, () => undefined));
  return run;
}

export async function getStore(shop: string = ELTON_SHOP): Promise<Store> {
  return structuredClone(await load(parseShop(shop)));
}
export function takenSlots(s: Store, day: string): string[] {
  return s.claims.filter((c) => c.day === day && c.status !== "cancelled" && c.slot).map((c) => c.slot);
}
export const uid = (p: string) => `${p}${Math.random().toString(36).slice(2, 8)}`;
export const shortCode = () => Math.random().toString(36).slice(2, 6).toUpperCase();
export function itemStatus(item: Item) {
  if (item.paused) return { ok: false as const, reason: "一時停止中" };
  if (item.claimId) return { ok: false as const, reason: "予約済みです" };
  return { ok: true as const };
}
