import { addDays, dayLbl, daysBetween, tokyoYmd } from "./days";
import { CANON_LINE, CANON_PHONE, DEF_LEAD, PICKUP_SLOTS, ytUrl } from "./sale";

export type Item = {
  id: string; name: string; price: number | null; note?: string; claimId?: string | null;
  photos?: string[]; paused?: boolean;
  /** Buyer pickup on/after this YMD; seller may list earlier. Clearable. */
  availableAfter?: string;
  /** Set on Jimoty magic-import rows — wipeImport deletes these only. */
  jimoty?: boolean;
};
export type PickupSpot = { id: string; name: string; mapsUrl: string };
export type Claim = {
  id: string; code: string; day: string; slot: string; itemIds: string[];
  contact?: string; contactMethod?: "jimoty" | "line" | "phone";
  /** Snapshot at book — survives admin spot edits/deletes. */
  spotId?: string; spotName?: string; spotMapsUrl?: string;
  /** requested = pending; booked = 予約済; picked_up = 引取済 (sold). */
  status: "requested" | "booked" | "picked_up" | "cancelled"; createdAt: string;
  waiters?: { account: string; at: string }[];
  buyerUid?: string;
  declineReason?: string;
};
export type Store = {
  address: string; bio?: string; jimotyUrl?: string; youtubeUrl?: string;
  lineInviteUrl?: string; phone?: string;
  slots?: string[];
  pickupSpots?: PickupSpot[];
  pickupFrom?: string; pickupTo?: string; moveOut?: string;
  leadDays?: number;
  /** 0 = off. Both set → count OR ¥ total. */
  minItems?: number; minTotal?: number;
  published?: boolean;
  ownerUid?: string;
  items: Item[]; claims: Claim[];
};

export const ELTON_SHOP = "elton";
export const shopPublished = (shop: string, s: Store) => !!s.published || shop === ELTON_SHOP;

export function shopContact(shop: string, s: Store) {
  const jimotyUrl = (s.jimotyUrl || "").trim();
  const lineInviteUrl = (s.lineInviteUrl || "").trim();
  const phone = (s.phone || "").trim();
  if (jimotyUrl || lineInviteUrl || phone) return { jimotyUrl, lineInviteUrl, phone };
  if (shop === ELTON_SHOP) return { jimotyUrl: "", lineInviteUrl: CANON_LINE, phone: CANON_PHONE };
  return { jimotyUrl: "", lineInviteUrl: "", phone: "" };
}

export const hasBuyerContact = (shop: string, s: Store) => {
  const c = shopContact(shop, s);
  return !!(c.jimotyUrl || c.lineInviteUrl || c.phone);
};

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const asYmd = (v: unknown) => { const s = String(v || "").trim(); return YMD.test(s) ? s : ""; };
export const shopSlots = (s: Store) => (s.slots?.length ? s.slots : [...PICKUP_SLOTS]);

/** Shop pickup window (no lead) — seller 日程変更. Open ~30d when 退去日 unset. */
export const pickupDays = (s: Store) => {
  const from = s.pickupFrom || tokyoYmd();
  const to = s.pickupTo || addDays(from, 29);
  const days = daysBetween(from, to);
  return days.length ? days : daysBetween(tokyoYmd(), addDays(tokyoYmd(), 29));
};

const shopLeadDays = (s: Store) =>
  s.leadDays == null || !Number.isFinite(s.leadDays) ? DEF_LEAD : Math.max(0, Math.floor(Number(s.leadDays)));

/** Buyer bookable — shop leadDays from today. */
export const bookableDays = (s: Store) =>
  pickupDays(s).filter((d) => d >= addDays(tokyoYmd(), shopLeadDays(s)));

/** Latest availableAfter among cart items (most limiting). Empty = no clamp. */
export function cartAfter(items: { availableAfter?: string }[]) {
  let m = "";
  for (const it of items) {
    const d = asYmd(it.availableAfter);
    if (d > m) m = d;
  }
  return m;
}

/** Soonest day+slot first (no past-bucket / not by name). */
export const byClaimWhen = (a: { day?: unknown; slot?: unknown }, b: { day?: unknown; slot?: unknown }) => {
  const k = (c: { day?: unknown; slot?: unknown }) => `${c.day || ""}${String(c.slot || "99:99").slice(0, 5)}`;
  const ka = k(a), kb = k(b);
  return ka < kb ? -1 : +(ka > kb);
};

export function normalizeSlots(raw: unknown): string[] {
  if (!Array.isArray(raw)) throw new Error("時間帯が不正です");
  const out = [...new Set(
    raw.map((x) => String(x).trim().replace(/\s*[-–—]\s*/g, "–")).filter(Boolean),
  )];
  if (!out.length) throw new Error("時間帯を1つ以上指定してください");
  return out;
}

export function applyDates(s: Store, raw: { pickupFrom?: unknown; pickupTo?: unknown; moveOut?: unknown; leadDays?: unknown }) {
  const from = tokyoYmd();
  const to = asYmd(raw.pickupTo) || asYmd(raw.moveOut);
  if (to && to < from) throw new Error("退去日は今日以降にしてください");
  if (to && !daysBetween(from, to).length) throw new Error("受取日が不正です");
  s.pickupFrom = from;
  s.pickupTo = to;
  s.moveOut = to;
  if ("leadDays" in raw) {
    const n = Number(raw.leadDays);
    if (!Number.isFinite(n) || n < 0) throw new Error("最短予約が不正です");
    s.leadDays = Math.floor(n);
  }
  return { pickupFrom: s.pickupFrom, pickupTo: s.pickupTo, moveOut: s.moveOut, leadDays: shopLeadDays(s) };
}

const asMin = (v: unknown) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? n : 0;
};
type Mins = { minItems?: number; minTotal?: number };
/** Exclusive read: at most one active. Both → keep total (strict). */
export function shopMins(s: Mins) {
  let minItems = asMin(s.minItems), minTotal = asMin(s.minTotal);
  if (minItems && minTotal) minItems = 0;
  return { minItems, minTotal };
}
/** Soft seller-voiced ask — items mode only (total mode is a hard checkout floor). */
export function cartRule(s: Mins): string | null {
  const { minItems: n, minTotal: y } = shopMins(s);
  if (y || !n) return null;
  return `出品者はまとめて${n}点以上希望（不人気・大型は1点でも歓迎）`;
}
/** Exclusive write: same rule as shopMins. */
export function applyMins(s: Store, raw: { minItems?: unknown; minTotal?: unknown }) {
  const out = shopMins({ minItems: asMin(raw.minItems), minTotal: asMin(raw.minTotal) });
  s.minItems = out.minItems;
  s.minTotal = out.minTotal;
  return out;
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

export function takenSlots(s: Store, day: string): string[] {
  return s.claims
    .filter((c) => c.day === day && c.status !== "cancelled" && c.slot)
    .map((c) => c.slot);
}

export const uid = (p: string) => `${p}${Math.random().toString(36).slice(2, 8)}`;
export const shortCode = () => Math.random().toString(36).slice(2, 6).toUpperCase();

/** Patch-safe normalize; empty list clears spots. */
export function normalizeSpots(raw: unknown): PickupSpot[] {
  if (!Array.isArray(raw)) throw new Error("受取場所が不正です");
  const out: PickupSpot[] = [];
  const seen = new Set<string>();
  for (const row of raw) {
    const r = row as { id?: unknown; name?: unknown; mapsUrl?: unknown };
    const name = String(r.name || "").trim();
    const mapsUrl = String(r.mapsUrl || "").trim();
    if (!name) continue;
    const id = String(r.id || "").trim() || uid("p");
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ id, name, mapsUrl });
  }
  return out;
}

function claimOf(s: Store, item: Item) {
  return item.claimId ? s.claims.find((c) => c.id === item.claimId) : undefined;
}

/** taken = locked; sold = 引取済; booked → when + 予約済; reqN = pending 依頼. */
export function itemFlags(s: Store, item: Item) {
  const c = claimOf(s, item);
  const sold = c?.status === "picked_up";
  const taken = c?.status === "booked" || sold;
  return {
    taken, sold,
    reqN: taken ? 0 : s.claims.reduce((n, x) => n + (x.status === "requested" && x.itemIds.includes(item.id) ? 1 : 0), 0),
    ...(c?.status === "booked" && c.day ? { when: `${dayLbl(c.day)}${c.slot ? ` ${c.slot}` : ""}` } : {}),
  };
}

export function shopFields(s: Store): Record<string, unknown> {
  return {
    address: s.address || "",
    bio: s.bio || "",
    jimotyUrl: s.jimotyUrl || "",
    youtubeUrl: s.youtubeUrl || "",
    lineInviteUrl: s.lineInviteUrl || "",
    phone: s.phone || "",
    slots: s.slots?.length ? s.slots : [],
    pickupSpots: s.pickupSpots || [],
    pickupFrom: s.pickupFrom || "",
    pickupTo: s.pickupTo || "",
    moveOut: s.moveOut || "",
    leadDays: shopLeadDays(s),
    ...shopMins(s),
    published: !!s.published,
    ...(s.ownerUid ? { ownerUid: s.ownerUid } : {}),
  };
}

export function itemFields(it: Item, pos: number): Record<string, unknown> {
  return {
    name: it.name, price: it.price, note: it.note || null, claimId: it.claimId || null,
    photos: it.photos || [], paused: !!it.paused, pos,
    availableAfter: asYmd(it.availableAfter) || null,
    ...(it.jimoty ? { jimoty: true } : {}),
  };
}

export function claimFields(c: Claim): Record<string, unknown> {
  return {
    code: c.code, day: c.day, slot: c.slot || null, itemIds: c.itemIds || [],
    contact: c.contact || null, contactMethod: c.contactMethod || null,
    status: c.status, createdAt: c.createdAt,
    waiters: c.waiters || [],
    ...(c.spotId ? { spotId: c.spotId, spotName: c.spotName || null, spotMapsUrl: c.spotMapsUrl || null } : {}),
    ...(c.buyerUid ? { buyerUid: c.buyerUid } : {}),
    ...(c.declineReason ? { declineReason: c.declineReason } : {}),
  };
}

export function storeFromDocs(
  shop: Record<string, unknown>,
  items: { id: string; data: Record<string, unknown> }[],
  claims: { id: string; data: Record<string, unknown> }[],
): Store {
  const s: Store = {
    address: String(shop.address || ""),
    items: [...items].sort((a, b) => Number(a.data.pos || 0) - Number(b.data.pos || 0)).map(({ id, data: r }) => {
      const it: Item = { id, name: String(r.name || ""), price: r.price == null ? null : Number(r.price) };
      if (r.note) it.note = String(r.note);
      if (r.claimId) it.claimId = String(r.claimId);
      if (Array.isArray(r.photos) && r.photos.length) it.photos = r.photos.map(String);
      if (r.paused) it.paused = true;
      { const a = asYmd(r.availableAfter); if (a) it.availableAfter = a; }
      if (r.jimoty) it.jimoty = true;
      return it;
    }),
    claims: [...claims]
      .sort((a, b) => byClaimWhen(a.data, b.data))
      .map(({ id, data: r }) => {
        const c: Claim = {
          id, code: String(r.code || ""), day: String(r.day || ""), slot: String(r.slot || ""),
          itemIds: Array.isArray(r.itemIds) ? r.itemIds.map(String) : [],
          status: (r.status as Claim["status"]) || "booked", createdAt: String(r.createdAt || ""),
        };
        if (r.contact) c.contact = String(r.contact);
        if (r.contactMethod) c.contactMethod = r.contactMethod as Claim["contactMethod"];
        if (r.spotId) c.spotId = String(r.spotId);
        if (r.spotName) c.spotName = String(r.spotName);
        if (r.spotMapsUrl) c.spotMapsUrl = String(r.spotMapsUrl);
        if (r.buyerUid) c.buyerUid = String(r.buyerUid);
        if (r.declineReason) c.declineReason = String(r.declineReason);
        if (Array.isArray(r.waiters)) {
          c.waiters = r.waiters.map((w) => {
            const row = w as { account?: string; at?: string };
            return { account: String(row.account || ""), at: String(row.at || "") };
          }).filter((w) => w.account);
        }
        return c;
      }),
  };
  if (shop.bio) s.bio = String(shop.bio);
  if (shop.jimotyUrl) s.jimotyUrl = String(shop.jimotyUrl);
  if (shop.youtubeUrl) s.youtubeUrl = String(shop.youtubeUrl);
  if (shop.lineInviteUrl) s.lineInviteUrl = String(shop.lineInviteUrl);
  if (shop.phone) s.phone = String(shop.phone);
  if (Array.isArray(shop.slots) && shop.slots.length) s.slots = shop.slots.map(String);
  if (Array.isArray(shop.pickupSpots) && shop.pickupSpots.length) {
    try { s.pickupSpots = normalizeSpots(shop.pickupSpots); } catch { /* ignore bad snap */ }
  }
  if (shop.pickupFrom) s.pickupFrom = String(shop.pickupFrom);
  if (shop.pickupTo) s.pickupTo = String(shop.pickupTo);
  if (shop.moveOut) s.moveOut = String(shop.moveOut);
  if (shop.leadDays != null && Number.isFinite(Number(shop.leadDays))) s.leadDays = Number(shop.leadDays);
  { const n = asMin(shop.minItems); if (n) s.minItems = n; }
  { const n = asMin(shop.minTotal); if (n) s.minTotal = n; }
  if (shop.published) s.published = true;
  if (shop.ownerUid) s.ownerUid = String(shop.ownerUid);
  if (!(s.youtubeUrl || "").trim()) {
    const y = ytUrl(s.bio || "");
    if (y) s.youtubeUrl = y;
  }
  return s;
}
