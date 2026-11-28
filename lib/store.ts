import { addDays, dayLbl, daysBetween, tokyoYmd } from "./days";
import { waitersFor, type Waiter } from "./waitlist";
import { CANON_LINE, CANON_PHONE, DEF_LEAD, DEF_OFF, PICKUP_SLOTS, ytUrl } from "./sale";

export type Item = {
  id: string; name: string; price: number | null; note?: string; claimId?: string | null;
  photos?: string[]; paused?: boolean;
  /** Buyer pickup on/after this YMD; seller may list earlier. Clearable. */
  availableAfter?: string;
  /** Set on Jimoty magic-import rows — wipeImport deletes these only. */
  jimoty?: boolean;
  /** Shop-builder idempotency key. Editor rows omit it. */
  externalKey?: string;
};
export type PickupSpot = { id: string; name: string; mapsUrl: string };
export type Claim = {
  id: string; code: string; day: string; slot: string; itemIds: string[];
  contact?: string; contactMethod?: "jimoty" | "line" | "phone" | "facebook" | "other";
  /** Snapshot at book — survives admin spot edits/deletes. */
  spotId?: string; spotName?: string; spotMapsUrl?: string;
  /** requested = pending; booked = 予約済; picked_up = 引取済 (sold). */
  status: "requested" | "booked" | "picked_up" | "cancelled"; createdAt: string;
  /** Back-up buyers (キャンセル待ち), join order. Kept on a cancelled claim so the owner can promote. */
  waiters?: Waiter[];
  buyerUid?: string;
  /** LINE Login userId (OA push). Soft Jimoty-only = absent → no push. */
  lineUid?: string;
  declineReason?: string;
};
export type Store = {
  address: string; bio?: string; jimotyUrl?: string; youtubeUrl?: string; facebookUrl?: string;
  lineInviteUrl?: string; phone?: string; otherUrl?: string;
  slots?: string[];
  pickupSpots?: PickupSpot[];
  pickupFrom?: string; pickupTo?: string; moveOut?: string;
  leadDays?: number;
  /** Yen off per cart item. unset → DEF_OFF; 0 = off. Legacy minItems/minTotal ignored. */
  itemOff?: number;
  published?: boolean;
  ownerUid?: string;
  /** Bound on claim — LINE Login userId for one-shop / owner match. */
  ownerLineUid?: string;
  /** Shop-builder bookkeeping. Editor writes do not set these. */
  rev?: number;
  externalKey?: string;
  source?: string;
  sellerId?: string;
  leaseAgentId?: string | null;
  leaseExpiresAt?: string | null;
  lastAgentId?: string;
  items: Item[]; claims: Claim[];
};

/** Keys the shop editor persists. The shop-builder contract uses this list. */
export const SHOP_SETTING_KEYS = [
  "address", "bio", "jimotyUrl", "youtubeUrl", "facebookUrl",
  "lineInviteUrl", "phone", "otherUrl", "slots", "pickupSpots",
  "pickupTo", "leadDays", "itemOff",
] as const;

/** Derived by applyDates; readable, not a separate editor input. */
export const SHOP_SETTING_READ_KEYS = ["pickupFrom", "moveOut"] as const;

export const ITEM_WRITE_KEYS = [
  "externalKey", "name", "price", "note", "photos", "paused", "availableAfter",
] as const;

export const PICKUP_SPOT_KEYS = ["id", "name", "mapsUrl"] as const;

/** Missing/blank → null (unset → 要相談). Explicit 0 stays ¥0. */
export function priceOf(v: unknown): number | null {
  if (v === "" || v == null || Number.isNaN(Number(v))) return null;
  return Math.max(0, Number(v));
}

export const wardStem = (v: string) => v.replace(/区$/, "");
/** Bare ward names gain 区 (目黒 → 目黒区). 市/町/村 are stored as written (川口市 stays 川口市). */
export function wardAddress(v: unknown) {
  const raw = String(v || "").trim();
  if (!raw) return "";
  if (/[市町村]$/.test(raw)) return raw;
  const s = raw.replace(/区$/, "");
  return s ? `${s}区` : "";
}

/** Strip owner fields and force unpublished. Shop-builder writes go through this. */
export function unclaimedShopWrite(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...data, published: false };
  for (const k of Object.keys(out)) if (k === "ownerUid" || k.startsWith("owner")) delete out[k];
  return out;
}

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
  return !!(c.jimotyUrl || c.lineInviteUrl || c.phone
    || (s.facebookUrl || "").trim() || (s.otherUrl || "").trim());
};

const YMD = /^\d{4}-\d{2}-\d{2}$/;
export function asYmd(v: unknown) {
  const s = String(v || "").trim();
  return YMD.test(s) ? s : "";
}
/** Single HH:mm — strips legacy ranges like 10:00–10:15 → 10:00. */
export function slotTime(raw: unknown): string {
  const m = String(raw || "").trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return "";
  return `${String(Math.min(23, +m[1])).padStart(2, "0")}:${String(Math.min(59, +m[2])).padStart(2, "0")}`;
}

export const shopSlots = (s: Store) => {
  const u = s.slots?.length ? [...new Set(s.slots.map(slotTime).filter(Boolean))].sort() : [];
  return u.length ? u : [...PICKUP_SLOTS];
};

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
  const k = (c: { day?: unknown; slot?: unknown }) => `${c.day || ""}${slotTime(c.slot) || "99:99"}`;
  const ka = k(a), kb = k(b);
  return ka < kb ? -1 : +(ka > kb);
};

export function normalizeSlots(raw: unknown): string[] {
  if (!Array.isArray(raw)) throw new Error("時間帯が不正です");
  const out = [...new Set(raw.map(slotTime).filter(Boolean))].sort();
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

/** unset/invalid → DEF_OFF; explicit 0 stays off. */
export function shopItemOff(s: { itemOff?: unknown }) {
  if (s.itemOff == null || s.itemOff === "") return DEF_OFF;
  const n = Math.floor(Number(s.itemOff));
  return Number.isFinite(n) && n >= 0 ? n : DEF_OFF;
}
export const cartDiscount = (n: number, off: number) => (off > 0 && n > 0 ? off * n : 0);
/** Soft encourage when discount is on. */
export function cartRule(off: number): string | null {
  return off > 0 ? `まとめ買い：1点あたり¥${off.toLocaleString("ja-JP")}引き` : null;
}
/** Persist seller rate; clears legacy min floors. Blank/NaN → 0 (off). */
export function applyItemOff(s: Store, raw: { itemOff?: unknown }) {
  const n = Math.floor(Number(raw.itemOff));
  const v = Number.isFinite(n) && n > 0 ? n : 0;
  s.itemOff = v;
  return { itemOff: v, minItems: 0, minTotal: 0 };
}

/** Apply editor settings onto a copy. Throws the same errors as the admin actions. */
export function applyShopSettings(current: Store, raw: Record<string, unknown>): Store {
  const next: Store = {
    ...current,
    slots: current.slots?.slice(),
    pickupSpots: current.pickupSpots?.map((s) => ({ ...s })),
  };
  if ("address" in raw) next.address = wardAddress(raw.address);
  if ("bio" in raw) next.bio = String(raw.bio || "").trim();
  for (const k of ["jimotyUrl", "youtubeUrl", "facebookUrl", "lineInviteUrl", "phone", "otherUrl"] as const) {
    if (k in raw) next[k] = String(raw[k] || "").trim();
  }
  if ("slots" in raw) next.slots = normalizeSlots(raw.slots);
  if ("pickupSpots" in raw) next.pickupSpots = normalizeSpots(raw.pickupSpots);
  if ("pickupTo" in raw || "leadDays" in raw) {
    applyDates(next, {
      pickupTo: "pickupTo" in raw ? raw.pickupTo : next.pickupTo,
      moveOut: "pickupTo" in raw ? raw.pickupTo : next.moveOut,
      leadDays: "leadDays" in raw ? raw.leadDays : next.leadDays,
    });
  }
  if ("itemOff" in raw) applyItemOff(next, { itemOff: raw.itemOff });
  return next;
}

/** Firestore patch for the setting keys present in `raw` (editor field names). */
export function settingsUpdate(current: Store, raw: Record<string, unknown>): Record<string, unknown> {
  const next = applyShopSettings(current, raw);
  const patch: Record<string, unknown> = {};
  if ("address" in raw) patch.address = next.address;
  if ("bio" in raw) patch.bio = next.bio || "";
  for (const k of ["jimotyUrl", "youtubeUrl", "facebookUrl", "lineInviteUrl", "phone", "otherUrl"] as const) {
    if (k in raw) patch[k] = next[k] || "";
  }
  if ("slots" in raw) patch.slots = next.slots || [];
  if ("pickupSpots" in raw) patch.pickupSpots = next.pickupSpots || [];
  if ("pickupTo" in raw || "leadDays" in raw) {
    patch.pickupFrom = next.pickupFrom || "";
    patch.pickupTo = next.pickupTo || "";
    patch.moveOut = next.moveOut || "";
    patch.leadDays = next.leadDays ?? DEF_LEAD;
  }
  if ("itemOff" in raw) {
    const out = applyItemOff(next, { itemOff: raw.itemOff });
    patch.itemOff = out.itemOff;
    patch.minItems = 0;
    patch.minTotal = 0;
  }
  return patch;
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
    .map((c) => slotTime(c.slot))
    .filter(Boolean);
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

/** taken = locked; sold = 引取済; booked → when + 予約済; reqN = pending 依頼; waitN/waitAs = FIFO waiters. */
export function itemFlags(s: Store, item: Item) {
  const c = claimOf(s, item);
  const sold = c?.status === "picked_up";
  const taken = c?.status === "booked" || sold;
  const waitAs = c?.status === "booked" ? waitersFor(c.waiters, item.id).map((w) => w.account) : [];
  return {
    taken, sold,
    reqN: taken ? 0 : s.claims.reduce((n, x) => n + (x.status === "requested" && x.itemIds.includes(item.id) ? 1 : 0), 0),
    waitN: waitAs.length,
    waitAs,
    ...(c?.status === "booked" && c.day
      ? { when: [dayLbl(c.day), slotTime(c.slot)].filter(Boolean).join(" ") }
      : {}),
  };
}

export function shopFields(s: Store): Record<string, unknown> {
  return {
    address: s.address || "",
    bio: s.bio || "",
    jimotyUrl: s.jimotyUrl || "",
    youtubeUrl: s.youtubeUrl || "",
    facebookUrl: s.facebookUrl || "",
    lineInviteUrl: s.lineInviteUrl || "",
    phone: s.phone || "",
    otherUrl: s.otherUrl || "",
    slots: s.slots?.length ? s.slots : [],
    pickupSpots: s.pickupSpots || [],
    pickupFrom: s.pickupFrom || "",
    pickupTo: s.pickupTo || "",
    moveOut: s.moveOut || "",
    leadDays: shopLeadDays(s),
    itemOff: shopItemOff(s),
    minItems: 0, minTotal: 0,
    published: !!s.published,
    ...(s.ownerUid ? { ownerUid: s.ownerUid } : {}),
    ...(s.rev != null ? { rev: s.rev } : {}),
    ...(s.externalKey ? { externalKey: s.externalKey, source: s.source || "", sellerId: s.sellerId || "" } : {}),
    ...(s.leaseAgentId ? { leaseAgentId: s.leaseAgentId, leaseExpiresAt: s.leaseExpiresAt || "" } : {}),
    ...(s.lastAgentId ? { lastAgentId: s.lastAgentId } : {}),
  };
}

export function itemFields(it: Item, pos: number): Record<string, unknown> {
  return {
    name: it.name, price: it.price, note: it.note || null, claimId: it.claimId || null,
    photos: it.photos || [], paused: !!it.paused, pos,
    availableAfter: asYmd(it.availableAfter) || null,
    ...(it.jimoty ? { jimoty: true } : {}),
    ...(it.externalKey ? { externalKey: it.externalKey } : {}),
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
    ...(c.lineUid ? { lineUid: c.lineUid } : {}),
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
      if (r.externalKey) it.externalKey = String(r.externalKey);
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
        if (r.lineUid) c.lineUid = String(r.lineUid);
        if (r.declineReason) c.declineReason = String(r.declineReason);
        if (Array.isArray(r.waiters)) {
          c.waiters = r.waiters.map((w) => {
            const row = w as { account?: string; at?: string; lineUid?: string; itemIds?: unknown };
            const out: Waiter = {
              account: String(row.account || ""), at: String(row.at || ""),
            };
            if (row.lineUid) out.lineUid = String(row.lineUid);
            if (Array.isArray(row.itemIds) && row.itemIds.length) out.itemIds = row.itemIds.map(String);
            return out;
          }).filter((w) => w.account);
        }
        return c;
      }),
  };
  if (shop.bio) s.bio = String(shop.bio);
  if (shop.jimotyUrl) s.jimotyUrl = String(shop.jimotyUrl);
  if (shop.youtubeUrl) s.youtubeUrl = String(shop.youtubeUrl);
  if (shop.facebookUrl) s.facebookUrl = String(shop.facebookUrl);
  if (shop.lineInviteUrl) s.lineInviteUrl = String(shop.lineInviteUrl);
  if (shop.phone) s.phone = String(shop.phone);
  if (shop.otherUrl) s.otherUrl = String(shop.otherUrl);
  if (Array.isArray(shop.slots) && shop.slots.length) s.slots = shop.slots.map(String);
  if (Array.isArray(shop.pickupSpots) && shop.pickupSpots.length) {
    try { s.pickupSpots = normalizeSpots(shop.pickupSpots); } catch { /* ignore bad snap */ }
  }
  if (shop.pickupFrom) s.pickupFrom = String(shop.pickupFrom);
  if (shop.pickupTo) s.pickupTo = String(shop.pickupTo);
  if (shop.moveOut) s.moveOut = String(shop.moveOut);
  if (shop.leadDays != null && Number.isFinite(Number(shop.leadDays))) s.leadDays = Number(shop.leadDays);
  if (shop.itemOff != null && shop.itemOff !== "") {
    const n = Math.floor(Number(shop.itemOff));
    if (Number.isFinite(n) && n >= 0) s.itemOff = n;
  }
  if (shop.published) s.published = true;
  if (shop.ownerUid) s.ownerUid = String(shop.ownerUid);
  if (shop.ownerLineUid) s.ownerLineUid = String(shop.ownerLineUid);
  if (shop.rev != null && Number.isFinite(Number(shop.rev))) s.rev = Number(shop.rev);
  if (shop.externalKey) s.externalKey = String(shop.externalKey);
  if (shop.source) s.source = String(shop.source);
  if (shop.sellerId) s.sellerId = String(shop.sellerId);
  if (shop.leaseAgentId) s.leaseAgentId = String(shop.leaseAgentId);
  if (shop.leaseExpiresAt) s.leaseExpiresAt = String(shop.leaseExpiresAt);
  if (shop.lastAgentId) s.lastAgentId = String(shop.lastAgentId);
  if (!(s.youtubeUrl || "").trim()) {
    const y = ytUrl(s.bio || "");
    if (y) s.youtubeUrl = y;
  }
  return s;
}
