import { addDays, daysBetween, tokyoYmd } from "./days";
import { CANON_LINE, CANON_PHONE, DEF_LEAD, PICKUP_DAYS, PICKUP_SLOTS, ytUrl } from "./sale";

export type Item = {
  id: string; name: string; price: number | null; note?: string; claimId?: string | null;
  photos?: string[]; paused?: boolean;
};
export type Claim = {
  id: string; code: string; day: string; slot: string; itemIds: string[];
  contact?: string; contactMethod?: "jimoty" | "line" | "phone";
  /** requested = pending; booked = confirmed 予約済. */
  status: "requested" | "booked" | "picked_up" | "cancelled"; createdAt: string;
  waiters?: { account: string; at: string }[];
  buyerUid?: string;
  declineReason?: string;
};
export type Store = {
  address: string; bio?: string; jimotyUrl?: string; youtubeUrl?: string;
  lineInviteUrl?: string; phone?: string;
  slots?: string[];
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

const shopDays = (s: Store) => {
  const days = daysBetween(s.pickupFrom || PICKUP_DAYS[0], s.pickupTo || PICKUP_DAYS[PICKUP_DAYS.length - 1]);
  return days.length ? days : [...PICKUP_DAYS];
};

const shopLeadDays = (s: Store) =>
  s.leadDays == null || !Number.isFinite(s.leadDays) ? DEF_LEAD : Math.max(0, Math.floor(Number(s.leadDays)));

export const bookableDays = (s: Store) =>
  shopDays(s).filter((d) => d >= addDays(tokyoYmd(), shopLeadDays(s)));

export function normalizeSlots(raw: unknown): string[] {
  if (!Array.isArray(raw)) throw new Error("時間帯が不正です");
  const out = [...new Set(
    raw.map((x) => String(x).trim().replace(/\s*[-–—]\s*/g, "–")).filter(Boolean),
  )];
  if (!out.length) throw new Error("時間帯を1つ以上指定してください");
  return out;
}

export function applyDates(s: Store, raw: { pickupFrom?: unknown; pickupTo?: unknown; moveOut?: unknown; leadDays?: unknown }) {
  const from = asYmd(raw.pickupFrom) || s.pickupFrom || PICKUP_DAYS[0];
  const to = asYmd(raw.pickupTo) || s.pickupTo || PICKUP_DAYS[PICKUP_DAYS.length - 1];
  if (to < from) throw new Error("退去日は開始以降にしてください");
  if (!daysBetween(from, to).length) throw new Error("受取日が不正です");
  s.pickupFrom = from;
  s.pickupTo = to;
  s.moveOut = asYmd(raw.moveOut) || to;
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
export const shopMins = (s: Mins) => ({
  minItems: asMin(s.minItems), minTotal: asMin(s.minTotal),
});
/** Both set → count OR ¥. One set → that gate. Neither → open. */
export function cartMeets(s: Mins, count: number, total: number) {
  const { minItems: n, minTotal: y } = shopMins(s);
  if (!n && !y) return true;
  if (n && y) return count >= n || total >= y;
  return n ? count >= n : total >= y;
}
export function cartRule(s: Mins): string | null {
  const { minItems: n, minTotal: y } = shopMins(s);
  if (!n && !y) return null;
  const pts = n ? `${n}点以上` : "";
  const yen = y ? `合計¥${y.toLocaleString("ja-JP")}以上` : "";
  return `引き取り条件：${pts && yen ? `${pts}、または${yen}` : pts || yen}`;
}
export function applyMins(s: Store, raw: { minItems?: unknown; minTotal?: unknown }) {
  s.minItems = asMin(raw.minItems);
  s.minTotal = asMin(raw.minTotal);
  return shopMins(s);
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

function claimOf(s: Store, item: Item) {
  return item.claimId ? s.claims.find((c) => c.id === item.claimId) : undefined;
}

/** taken = confirmed 予約済; requested = pending soft notice only (still 依頼可). Orphan/cancelled → free. */
export function itemFlags(s: Store, item: Item) {
  if (!item.claimId) return { taken: false, requested: false };
  const st = claimOf(s, item)?.status;
  if (!st || st === "cancelled") return { taken: false, requested: false };
  return { taken: st === "booked" || st === "picked_up", requested: st === "requested" };
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
  };
}

export function claimFields(c: Claim): Record<string, unknown> {
  return {
    code: c.code, day: c.day, slot: c.slot || null, itemIds: c.itemIds || [],
    contact: c.contact || null, contactMethod: c.contactMethod || null,
    status: c.status, createdAt: c.createdAt,
    waiters: c.waiters || [],
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
      return it;
    }),
    claims: [...claims]
      .sort((a, b) => String(b.data.createdAt || "").localeCompare(String(a.data.createdAt || "")))
      .map(({ id, data: r }) => {
        const c: Claim = {
          id, code: String(r.code || ""), day: String(r.day || ""), slot: String(r.slot || ""),
          itemIds: Array.isArray(r.itemIds) ? r.itemIds.map(String) : [],
          status: (r.status as Claim["status"]) || "booked", createdAt: String(r.createdAt || ""),
        };
        if (r.contact) c.contact = String(r.contact);
        if (r.contactMethod) c.contactMethod = r.contactMethod as Claim["contactMethod"];
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
