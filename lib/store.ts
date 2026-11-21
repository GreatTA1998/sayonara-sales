import { daysBetween } from "./days";
import { sb } from "./db";
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

type R = Record<string, unknown>;
const shopRow = (id: string, s: Store) => ({
  id, address: s.address || "", bio: s.bio || "", jimoty_url: s.jimotyUrl || "",
  youtube_url: s.youtubeUrl || "", line_invite_url: s.lineInviteUrl || "", phone: s.phone || "",
  slots: s.slots?.length ? s.slots : null, pickup_from: s.pickupFrom || null,
  pickup_to: s.pickupTo || null, move_out: s.moveOut || null, published: !!s.published,
});
const itemRow = (shop: string, it: Item, pos: number) => ({
  id: it.id, shop_id: shop, name: it.name, price: it.price, note: it.note || null,
  claim_id: it.claimId || null, photos: it.photos || [], paused: !!it.paused, pos,
});
const claimRow = (shop: string, c: Claim) => ({
  id: c.id, shop_id: shop, code: c.code, day: c.day, slot: c.slot || null,
  item_ids: c.itemIds || [], contact: c.contact || null, contact_method: c.contactMethod || null,
  status: c.status, created_at: c.createdAt,
});

function fromDb(shop: R, items: R[], claims: R[]): Store {
  const s: Store = {
    address: String(shop.address || ""),
    items: [...items].sort((a, b) => Number(a.pos) - Number(b.pos)).map((r) => {
      const it: Item = { id: String(r.id), name: String(r.name || ""), price: r.price == null ? null : Number(r.price) };
      if (r.note) it.note = String(r.note);
      if (r.claim_id) it.claimId = String(r.claim_id);
      if (Array.isArray(r.photos) && r.photos.length) it.photos = r.photos.map(String);
      if (r.paused) it.paused = true;
      return it;
    }),
    claims: claims.map((r) => {
      const c: Claim = {
        id: String(r.id), code: String(r.code), day: String(r.day), slot: String(r.slot || ""),
        itemIds: Array.isArray(r.item_ids) ? r.item_ids.map(String) : [],
        status: r.status as Claim["status"], createdAt: String(r.created_at),
      };
      if (r.contact) c.contact = String(r.contact);
      if (r.contact_method) c.contactMethod = r.contact_method as Claim["contactMethod"];
      return c;
    }),
  };
  if (shop.bio) s.bio = String(shop.bio);
  if (shop.jimoty_url) s.jimotyUrl = String(shop.jimoty_url);
  if (shop.youtube_url) s.youtubeUrl = String(shop.youtube_url);
  if (shop.line_invite_url) s.lineInviteUrl = String(shop.line_invite_url);
  if (shop.phone) s.phone = String(shop.phone);
  if (Array.isArray(shop.slots) && shop.slots.length) s.slots = shop.slots.map(String);
  if (shop.pickup_from) s.pickupFrom = String(shop.pickup_from);
  if (shop.pickup_to) s.pickupTo = String(shop.pickup_to);
  if (shop.move_out) s.moveOut = String(shop.move_out);
  if (shop.published) s.published = true;
  if (!(s.youtubeUrl || "").trim()) { const y = ytUrl(s.bio || ""); if (y) s.youtubeUrl = y; }
  return s;
}

async function load(id: string): Promise<Store> {
  const shops = await sb<R[]>(`shops?id=eq.${encodeURIComponent(id)}&select=*`);
  if (!shops.length) {
    const s = seed(id);
    await sb("shops", { method: "POST", prefer: "resolution=merge-duplicates,return=minimal", body: JSON.stringify(shopRow(id, s)) });
    return s;
  }
  const [items, claims] = await Promise.all([
    sb<R[]>(`items?shop_id=eq.${encodeURIComponent(id)}&select=*&order=pos`),
    sb<R[]>(`claims?shop_id=eq.${encodeURIComponent(id)}&select=*&order=created_at.desc`),
  ]);
  return fromDb(shops[0], items, claims);
}

/** Granular persist — only changed rows (concurrent item edits don't clobber). */
async function persist(shop: string, before: Store, after: Store) {
  const aShop = shopRow(shop, after);
  if (j(shopRow(shop, before)) !== j(aShop)) {
    await sb("shops", {
      method: "POST", prefer: "resolution=merge-duplicates,return=minimal",
      body: JSON.stringify({ ...aShop, updated_at: new Date().toISOString() }),
    });
  }
  const bI = new Map(before.items.map((it, i) => [it.id, itemRow(shop, it, i)]));
  const aI = after.items.map((it, i) => itemRow(shop, it, i));
  const aIds = new Set(aI.map((r) => r.id));
  const delI = [...bI.keys()].filter((id) => !aIds.has(id));
  const upI = aI.filter((r) => j(bI.get(r.id)) !== j(r));
  if (delI.length) {
    await sb(`items?shop_id=eq.${encodeURIComponent(shop)}&id=in.(${delI.map(encodeURIComponent).join(",")})`, { method: "DELETE" });
  }
  if (upI.length) {
    await sb("items", { method: "POST", prefer: "resolution=merge-duplicates,return=minimal", body: JSON.stringify(upI) });
  }
  const bC = new Map(before.claims.map((c) => [c.id, claimRow(shop, c)]));
  const aC = after.claims.map((c) => claimRow(shop, c));
  const aCids = new Set(aC.map((r) => r.id));
  const delC = [...bC.keys()].filter((id) => !aCids.has(id));
  const upC = aC.filter((r) => j(bC.get(r.id)) !== j(r));
  if (delC.length) {
    await sb(`claims?shop_id=eq.${encodeURIComponent(shop)}&id=in.(${delC.map(encodeURIComponent).join(",")})`, { method: "DELETE" });
  }
  if (upC.length) {
    await sb("claims", { method: "POST", prefer: "resolution=merge-duplicates,return=minimal", body: JSON.stringify(upC) });
  }
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
