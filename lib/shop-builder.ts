import { createHash } from "node:crypto";
import {
  arrayUnion, collection, doc, getDoc, getDocs, limit, query, runTransaction, where,
  type Firestore, type Transaction,
} from "firebase/firestore";
import { BlobPhotoError, isStoredPhoto, storeShopPhoto, storeShopPhotoFromUrl } from "./blob-photo";
import { DEF_LEAD, DEF_OFF } from "./sale";
import { LIMITS } from "./shop-limits";
import { SITE_URL } from "./site";
import {
  ITEM_WRITE_KEYS, PICKUP_SPOT_KEYS, SHOP_SETTING_KEYS, applyShopSettings, asYmd, itemFields,
  itemFlags, priceOf, settingsUpdate, shopFields, shopItemOff, shopSlots, storeFromDocs,
  unclaimedShopWrite, type Item, type Store,
} from "./store";

export { LIMITS };

export class ShopBuilderError extends Error {
  constructor(readonly status: number, message: string, readonly extra: Record<string, unknown> = {}) {
    super(message);
  }
}

const SOURCE = /^[a-z0-9][a-z0-9._:-]{0,63}$/;
const ITEM_KEY = /^[A-Za-z0-9._:~-]{1,120}$/;
const ROOT_KEYS = ["externalSource", "id", "settings", "items", "dryRun", "lease", "leaseSeconds"];

export type Opt = { agentId: string; ifMatch?: number | "*"; now: string; dryRun?: boolean };

type Fields = {
  name?: string;
  price?: number | null;
  note?: string | null;
  photos?: string[];
  paused?: boolean;
  availableAfter?: string | null;
};
type ValidItem = { externalKey: string; fields: Fields };
type ItemOp = { op: "upsert"; item: ValidItem } | { op: "delete"; externalKey: string };
type UpsertIn = {
  source: string; sellerId: string; explicit?: string;
  settings?: Record<string, unknown>; items?: ValidItem[];
  lease: boolean; leaseSeconds?: number; dryRun: boolean;
};

export type ItemJson = {
  id: string | null; externalKey: string | null; name: string; price: number | null;
  note: string; photos: string[]; paused: boolean; availableAfter: string | null; sold: boolean;
};
export type ShopState = {
  id: string | null; rev: number; url: string | null; editorUrl: string | null;
  path: string | null; editorPath: string | null; claimed: boolean; published: boolean;
  externalSource: { source: string; sellerId: string } | null;
  lease: { agentId: string; expiresAt: string } | null;
  lastAgentId: string | null;
  settings: ReturnType<typeof settingsOf>;
  items: ItemJson[];
  dryRun?: boolean; created?: boolean; kept?: string[];
  photo?: { url: string; bytesIn: number; bytesOut: number };
};

export function externalKeyOf(source: string, sellerId: string) {
  return `${source}\n${sellerId}`;
}
export function sourceDocId(source: string, sellerId: string) {
  return createHash("sha256").update(externalKeyOf(source, sellerId)).digest("hex");
}
export function itemDocId(externalKey: string, n = 0) {
  return `i${createHash("sha256").update(`${externalKey}\n${n}`).digest("hex").slice(0, 12)}`;
}

function bad(status: number, message: string, extra: Record<string, unknown> = {}) {
  return new ShopBuilderError(status, message, extra);
}
function links(id: string) {
  return {
    url: `${SITE_URL}/s/${id}`,
    editorUrl: `${SITE_URL}/s/${id}/admin`,
    path: `/s/${id}`,
    editorPath: `/s/${id}/admin`,
  };
}
export function dig5(id: string) {
  if (!/^\d{5}$/.test(id)) throw bad(400, "Shop id must be 5 digits", { code: "validation" });
  return id;
}
function revOf(meta: Record<string, unknown> | null | undefined) {
  const n = Number(meta?.rev);
  return Number.isFinite(n) ? n : 0;
}
export function activeLease(meta: Record<string, unknown> | null | undefined, now: string) {
  if (!meta) return null;
  const agentId = typeof meta.leaseAgentId === "string" ? meta.leaseAgentId : "";
  const expiresAt = typeof meta.leaseExpiresAt === "string" ? meta.leaseExpiresAt : "";
  if (!agentId || !expiresAt || expiresAt <= now) return null;
  return { agentId, expiresAt };
}
function addSeconds(iso: string, seconds: number) {
  return new Date(Date.parse(iso) + seconds * 1000).toISOString();
}
function baseStore(): Store {
  return { address: "", items: [], claims: [], leadDays: DEF_LEAD, itemOff: DEF_OFF, published: false };
}
function unknown(obj: Record<string, unknown>, allowed: readonly string[], path: string) {
  const extra = Object.keys(obj).filter((k) => !allowed.includes(k));
  if (extra.length) throw bad(400, `Unknown ${path}: ${extra.join(", ")}`, { code: "validation" });
}
function asObj(v: unknown, path: string) {
  if (!v || typeof v !== "object" || Array.isArray(v)) throw bad(400, `${path} must be an object`, { code: "validation" });
  return v as Record<string, unknown>;
}
function rejectUnsafe(v: unknown, path: string) {
  if (!v || typeof v !== "object") return;
  if (Array.isArray(v)) { v.forEach((x, i) => rejectUnsafe(x, `${path}[${i}]`)); return; }
  for (const [k, child] of Object.entries(v as Record<string, unknown>)) {
    if (k === "published" || k === "ownerUid" || k.startsWith("owner")) {
      throw bad(400, `${path}.${k} cannot be set`, { code: "validation" });
    }
    rejectUnsafe(child, `${path}.${k}`);
  }
}

function guard(meta: Record<string, unknown> | null, id: string, opt: Opt) {
  if (!meta) {
    if (typeof opt.ifMatch === "number" && opt.ifMatch !== 0) {
      throw bad(412, "Revision mismatch", { code: "revision_mismatch", rev: 0, id });
    }
    return;
  }
  if (typeof meta.ownerUid === "string" && meta.ownerUid) {
    throw bad(409, "Shop is claimed", { code: "claimed", id, ...links(id), claimed: true, rev: revOf(meta) });
  }
  const lease = activeLease(meta, opt.now);
  if (lease && lease.agentId !== opt.agentId) {
    throw bad(423, "Lease held", { code: "lease_held", id, ...links(id), lease, rev: revOf(meta) });
  }
  const rev = revOf(meta);
  if (opt.ifMatch != null && opt.ifMatch !== "*" && rev !== opt.ifMatch) {
    throw bad(412, "Revision mismatch", { code: "revision_mismatch", id, rev });
  }
}
function mustExist(meta: Record<string, unknown> | null, id: string, opt: Opt) {
  if (!meta) throw bad(404, "Shop not found", { code: "not_found" });
  guard(meta, id, opt);
}

function parseSource(raw: unknown) {
  const o = asObj(raw, "externalSource");
  unknown(o, ["source", "sellerId"], "externalSource");
  const source = String(o.source || "").trim().toLowerCase();
  const sellerId = String(o.sellerId || "").trim();
  if (!SOURCE.test(source)) throw bad(400, "externalSource.source is invalid", { code: "validation" });
  if (!sellerId || sellerId.length > 500 || /[\n\r]/.test(sellerId)) {
    throw bad(400, "externalSource.sellerId is invalid", { code: "validation" });
  }
  return { source, sellerId };
}
export function parseItemKey(raw: string) {
  const s = decodeURIComponent(raw).trim();
  if (!ITEM_KEY.test(s)) throw bad(400, "Item key must match [A-Za-z0-9._:~-]{1,120}", { code: "validation" });
  return s;
}
function parsePhotos(v: unknown, path: string) {
  if (!Array.isArray(v)) throw bad(400, `${path} must be an array`, { code: "validation" });
  if (v.length > LIMITS.photosPerItem) {
    throw bad(400, `${path} exceeds ${LIMITS.photosPerItem} photos`, { code: "validation" });
  }
  return v.map((p, i) => {
    if (typeof p !== "string" || !p.trim()) throw bad(400, `${path}[${i}] must be a URL`, { code: "validation" });
    const url = p.trim();
    if (!isStoredPhoto(url)) {
      let parsed: URL;
      try { parsed = new URL(url); }
      catch { throw bad(400, `${path}[${i}] must be an https URL`, { code: "validation" }); }
      if (parsed.protocol !== "https:") throw bad(400, `${path}[${i}] must be an https URL`, { code: "validation" });
    }
    return url;
  });
}
function parseItem(raw: unknown, path: string, keyFromPath?: string): ValidItem {
  const o = asObj(raw, path);
  unknown(o, ITEM_WRITE_KEYS, path);
  const externalKey = keyFromPath || (typeof o.externalKey === "string" ? o.externalKey.trim() : "");
  if (!keyFromPath && !ITEM_KEY.test(externalKey)) {
    throw bad(400, `${path}.externalKey is invalid`, { code: "validation" });
  }
  if (typeof o.externalKey === "string" && o.externalKey.trim() !== externalKey) {
    throw bad(400, `${path}.externalKey does not match`, { code: "validation" });
  }
  const fields: Fields = {};
  if ("name" in o) {
    if (typeof o.name !== "string") throw bad(400, `${path}.name must be a string`, { code: "validation" });
    fields.name = o.name.trim();
  }
  if ("price" in o) {
    if (o.price != null && (typeof o.price !== "number" || !Number.isFinite(o.price))) {
      throw bad(400, `${path}.price must be a number or null`, { code: "validation" });
    }
    if (typeof o.price === "number" && o.price < 0) throw bad(400, `${path}.price must be ≥ 0`, { code: "validation" });
    fields.price = priceOf(o.price);
  }
  if ("note" in o) {
    if (o.note != null && typeof o.note !== "string") throw bad(400, `${path}.note must be a string`, { code: "validation" });
    fields.note = o.note == null ? null : String(o.note).trim();
  }
  if ("photos" in o) fields.photos = parsePhotos(o.photos, `${path}.photos`);
  if ("paused" in o) {
    if (typeof o.paused !== "boolean") throw bad(400, `${path}.paused must be a boolean`, { code: "validation" });
    fields.paused = o.paused;
  }
  if ("availableAfter" in o) {
    if (o.availableAfter == null || o.availableAfter === "") fields.availableAfter = null;
    else {
      const y = asYmd(o.availableAfter);
      if (!y) throw bad(400, `${path}.availableAfter must be YYYY-MM-DD`, { code: "validation" });
      fields.availableAfter = y;
    }
  }
  return { externalKey, fields };
}
function parseSettings(raw: unknown) {
  if (raw == null) return undefined;
  const o = asObj(raw, "settings");
  unknown(o, SHOP_SETTING_KEYS, "settings");
  for (const k of ["address", "bio", "jimotyUrl", "youtubeUrl", "facebookUrl", "lineInviteUrl", "phone"] as const) {
    if (k in o && typeof o[k] !== "string") throw bad(400, `settings.${k} must be a string`, { code: "validation" });
  }
  for (const k of ["leadDays", "itemOff"] as const) {
    if (k in o && (typeof o[k] !== "number" || !Number.isFinite(o[k] as number))) {
      throw bad(400, `settings.${k} must be a number`, { code: "validation" });
    }
  }
  if ("pickupTo" in o && o.pickupTo != null && o.pickupTo !== "" && typeof o.pickupTo !== "string") {
    throw bad(400, "settings.pickupTo must be a string", { code: "validation" });
  }
  if ("slots" in o && !Array.isArray(o.slots)) throw bad(400, "settings.slots must be an array", { code: "validation" });
  if ("pickupSpots" in o) {
    if (!Array.isArray(o.pickupSpots)) throw bad(400, "settings.pickupSpots must be an array", { code: "validation" });
    o.pickupSpots.forEach((spot, i) => {
      const row = asObj(spot, `settings.pickupSpots[${i}]`);
      unknown(row, PICKUP_SPOT_KEYS, `settings.pickupSpots[${i}]`);
      if (typeof row.name !== "string" || !row.name.trim()) {
        throw bad(400, `settings.pickupSpots[${i}].name is required`, { code: "validation" });
      }
      if ("mapsUrl" in row && typeof row.mapsUrl !== "string") {
        throw bad(400, `settings.pickupSpots[${i}].mapsUrl must be a string`, { code: "validation" });
      }
      if ("id" in row && typeof row.id !== "string") {
        throw bad(400, `settings.pickupSpots[${i}].id must be a string`, { code: "validation" });
      }
    });
  }
  try { applyShopSettings(baseStore(), o); }
  catch (e) {
    if (e instanceof ShopBuilderError) throw e;
    throw bad(400, e instanceof Error ? e.message : "Invalid settings", { code: "validation" });
  }
  return o;
}
function parseItems(raw: unknown): ValidItem[] | undefined {
  if (raw == null) return undefined;
  if (!Array.isArray(raw)) throw bad(400, "items must be an array", { code: "validation" });
  if (raw.length > LIMITS.itemsPerRequest) {
    throw bad(400, `items exceeds ${LIMITS.itemsPerRequest}`, { code: "validation" });
  }
  const items = raw.map((row, i) => parseItem(row, `items[${i}]`));
  const seen = new Set<string>();
  for (const it of items) {
    if (seen.has(it.externalKey)) throw bad(400, `Duplicate item key ${it.externalKey}`, { code: "validation" });
    seen.add(it.externalKey);
  }
  return items;
}
function parseUpsert(body: unknown): UpsertIn {
  const o = asObj(body, "body");
  rejectUnsafe(o, "body");
  unknown(o, ROOT_KEYS, "body");
  if (!("externalSource" in o)) throw bad(400, "externalSource is required", { code: "validation" });
  const { source, sellerId } = parseSource(o.externalSource);
  let explicit: string | undefined;
  if ("id" in o && o.id != null && o.id !== "") explicit = dig5(String(o.id));
  const settings = parseSettings(o.settings);
  const items = parseItems(o.items);
  if ("lease" in o && typeof o.lease !== "boolean") throw bad(400, "lease must be a boolean", { code: "validation" });
  if ("leaseSeconds" in o && o.lease !== true) throw bad(400, "leaseSeconds requires lease: true", { code: "validation" });
  let leaseSeconds: number | undefined;
  if (o.lease === true && "leaseSeconds" in o) {
    const n = o.leaseSeconds;
    if (typeof n !== "number" || !Number.isInteger(n) || n < 60 || n > LIMITS.leaseSeconds) {
      throw bad(400, `leaseSeconds must be an integer from 60 to ${LIMITS.leaseSeconds}`, { code: "validation" });
    }
    leaseSeconds = n;
  }
  return { source, sellerId, explicit, settings, items, lease: o.lease === true, leaseSeconds, dryRun: o.dryRun === true };
}

function settingsOf(s: Store) {
  return {
    address: s.address || "",
    bio: s.bio || "",
    jimotyUrl: s.jimotyUrl || "",
    youtubeUrl: s.youtubeUrl || "",
    facebookUrl: s.facebookUrl || "",
    lineInviteUrl: s.lineInviteUrl || "",
    phone: s.phone || "",
    slots: s.slots?.length ? s.slots : shopSlots(s),
    pickupSpots: s.pickupSpots || [],
    pickupFrom: s.pickupFrom || "",
    pickupTo: s.pickupTo || "",
    moveOut: s.moveOut || "",
    leadDays: s.leadDays ?? DEF_LEAD,
    itemOff: shopItemOff(s),
  };
}
function itemJson(store: Store, it: Item): ItemJson {
  return {
    id: it.id,
    externalKey: it.externalKey || null,
    name: it.name,
    price: it.price,
    note: it.note || "",
    photos: it.photos || [],
    paused: !!it.paused,
    availableAfter: it.availableAfter || null,
    sold: itemFlags(store, it).sold,
  };
}
function shopState(
  id: string,
  meta: Record<string, unknown>,
  items: { id: string; data: Record<string, unknown> }[],
  claims: { id: string; data: Record<string, unknown> }[],
  now: string,
): ShopState {
  const store = storeFromDocs(meta, items, claims);
  const claimed = typeof meta.ownerUid === "string" && !!meta.ownerUid;
  return {
    id,
    rev: revOf(meta),
    ...links(id),
    claimed,
    published: meta.published === true,
    externalSource: meta.source && meta.sellerId
      ? { source: String(meta.source), sellerId: String(meta.sellerId) } : null,
    lease: activeLease(meta, now),
    lastAgentId: meta.lastAgentId ? String(meta.lastAgentId) : null,
    settings: settingsOf(store),
    items: store.items.map((it) => itemJson(store, it)),
  };
}
async function loadShop(db: Firestore, id: string, now: string) {
  const snap = await getDoc(doc(db, "shops", id));
  if (!snap.exists()) throw bad(404, "Shop not found", { code: "not_found" });
  const [items, claims] = await Promise.all([
    getDocs(collection(db, "shops", id, "items")),
    getDocs(collection(db, "shops", id, "claims")),
  ]);
  return shopState(
    id,
    snap.data(),
    items.docs.map((d) => ({ id: d.id, data: d.data() })),
    claims.docs.map((d) => ({ id: d.id, data: d.data() })),
    now,
  );
}
async function peek(db: Firestore, source: string, sellerId: string) {
  const key = externalKeyOf(source, sellerId);
  const pointer = await getDoc(doc(db, "shopSources", sourceDocId(source, sellerId)));
  const shopId = pointer.exists() ? String(pointer.data()?.shopId || "") : "";
  if (shopId) {
    const shop = await getDoc(doc(db, "shops", shopId));
    return shop.exists() ? { id: shopId, data: shop.data() } : null;
  }
  const found = await getDocs(query(collection(db, "shops"), where("externalKey", "==", key), limit(1)));
  if (found.empty) return null;
  return { id: found.docs[0].id, data: found.docs[0].data() };
}

function leasePatch(meta: Record<string, unknown> | null, opt: Opt, want: boolean, seconds?: number) {
  if (want) {
    return { leaseAgentId: opt.agentId, leaseExpiresAt: addSeconds(opt.now, seconds ?? LIMITS.leaseSeconds) };
  }
  if (!activeLease(meta, opt.now)) return { leaseAgentId: null, leaseExpiresAt: null };
  return {};
}
function candidateIds(source: string, sellerId: string) {
  const ids: string[] = [];
  for (let i = 0; ids.length < 8 && i < 24; i++) {
    const n = createHash("sha256").update(`${source}\n${sellerId}\n${i}`).digest().readUInt32BE(0) % 90000;
    const id = String(10000 + n);
    if (!ids.includes(id)) ids.push(id);
  }
  return ids;
}

async function rehost(shopId: string, items: ValidItem[]) {
  const stub = process.env.SHOP_BUILDER_PHOTO_STUB === "1";
  for (const it of items) {
    if (!it.fields.photos) continue;
    const urls: string[] = [];
    for (const u of it.fields.photos) {
      try { urls.push(await storeShopPhotoFromUrl(shopId, itemDocId(it.externalKey), u, { stub })); }
      catch (e) {
        if (e instanceof BlobPhotoError) throw bad(e.status, e.message, { code: "validation" });
        throw e;
      }
    }
    it.fields.photos = urls;
  }
}

function pickItemId(key: string, byId: Map<string, Record<string, unknown>>, prev?: string) {
  if (prev) return prev;
  for (let n = 0; n < 4; n++) {
    const id = itemDocId(key, n);
    const row = byId.get(id);
    if (!row || row.externalKey === key) return id;
  }
  throw bad(409, "Item id collision", { code: "conflict" });
}
function planItem(item: ValidItem, prev: Record<string, unknown> | undefined, id: string, pos: number) {
  if (!prev) {
    const it: Item = {
      id,
      name: item.fields.name ?? "",
      price: item.fields.price === undefined ? null : item.fields.price,
      externalKey: item.externalKey,
      photos: item.fields.photos || [],
      paused: !!item.fields.paused,
    };
    if (item.fields.note) it.note = item.fields.note;
    if (item.fields.availableAfter) it.availableAfter = item.fields.availableAfter;
    return { op: "set" as const, id, data: itemFields(it, pos) };
  }
  const data: Record<string, unknown> = { externalKey: item.externalKey };
  const f = item.fields;
  if (f.name !== undefined) data.name = f.name;
  if (f.price !== undefined) data.price = f.price;
  if (f.note !== undefined) data.note = f.note || null;
  if (f.photos !== undefined) data.photos = f.photos;
  if (f.paused !== undefined) data.paused = f.paused;
  if (f.availableAfter !== undefined) data.availableAfter = f.availableAfter || null;
  return { op: "update" as const, id, data };
}

async function applyOps(
  db: Firestore, shopId: string, ops: ItemOp[], opt: Opt, expectRev: number | null, reconcile: boolean,
) {
  const pre = await getDocs(collection(db, "shops", shopId, "items"));
  const ids = new Set(pre.docs.map((d) => d.id));
  for (const op of ops) {
    if (op.op !== "upsert") continue;
    for (let n = 0; n < 4; n++) ids.add(itemDocId(op.item.externalKey, n));
  }
  const idList = [...ids];
  return runTransaction(db, async (tx) => {
    const shopRef = doc(db, "shops", shopId);
    const shop = await tx.get(shopRef);
    const meta = shop.exists() ? shop.data() : null;
    mustExist(meta, shopId, opt);
    if (expectRev != null && revOf(meta) !== expectRev) {
      throw bad(412, "Revision mismatch", { code: "revision_mismatch", id: shopId, rev: revOf(meta) });
    }
    const byId = new Map<string, Record<string, unknown>>();
    const byKey = new Map<string, { id: string; data: Record<string, unknown> }>();
    let pos = 0;
    for (const itemId of idList) {
      const row = await tx.get(doc(db, "shops", shopId, "items", itemId));
      if (!row.exists()) continue;
      pos += 1;
      const data = row.data();
      byId.set(itemId, data);
      if (typeof data.externalKey === "string" && data.externalKey) byKey.set(data.externalKey, { id: itemId, data });
    }
    const seen = new Set<string>();
    const writes: { op: "set" | "update" | "delete"; id: string; data?: Record<string, unknown> }[] = [];
    for (const op of ops) {
      if (op.op === "delete") {
        const prev = byKey.get(op.externalKey);
        if (!prev) throw bad(404, "Item not found", { code: "not_found" });
        if (prev.data.claimId) throw bad(409, "Item has a pickup claim", { code: "item_claimed" });
        writes.push({ op: "delete", id: prev.id });
        continue;
      }
      seen.add(op.item.externalKey);
      const prev = byKey.get(op.item.externalKey);
      const id = pickItemId(op.item.externalKey, byId, prev?.id);
      const row = planItem(op.item, prev?.data, id, pos);
      if (!prev) pos += 1;
      writes.push(row);
      byId.set(id, { ...(prev?.data || {}), externalKey: op.item.externalKey });
      byKey.set(op.item.externalKey, { id, data: byId.get(id)! });
    }
    const kept: string[] = [];
    if (reconcile) {
      for (const [key, prev] of byKey) {
        if (seen.has(key)) continue;
        if (prev.data.claimId) { kept.push(key); continue; }
        writes.push({ op: "delete", id: prev.id });
      }
    }
    tx.update(shopRef, unclaimedShopWrite({
      rev: revOf(meta) + 1, updatedAt: opt.now, lastAgentId: opt.agentId,
    }));
    for (const w of writes) {
      const ref = doc(db, "shops", shopId, "items", w.id);
      if (w.op === "delete") tx.delete(ref);
      else if (w.op === "set") tx.set(ref, w.data!);
      else tx.update(ref, w.data!);
    }
    return kept;
  });
}

async function upsertOnce(db: Firestore, input: UpsertIn, opt: Opt): Promise<ShopState> {
  const key = externalKeyOf(input.source, input.sellerId);
  const shell = await runTransaction(db, async (tx) => {
    const pointerRef = doc(db, "shopSources", sourceDocId(input.source, input.sellerId));
    const pointer = await tx.get(pointerRef);
    let shopId = "";
    let data: Record<string, unknown> | null = null;
    if (pointer.exists()) {
      shopId = String(pointer.data()?.shopId || "");
      if (!/^\d{5}$/.test(shopId)) throw bad(409, "Source binding is invalid", { code: "conflict" });
      if (input.explicit && input.explicit !== shopId) {
        throw bad(409, "externalSource is already bound to another shop", {
          code: "conflict", id: shopId, ...links(shopId),
        });
      }
      const shop = await tx.get(doc(db, "shops", shopId));
      if (shop.exists()) data = shop.data();
      else shopId = "";
    }
    if (!pointer.exists() || !shopId) {
      if (input.explicit) {
        const shop = await tx.get(doc(db, "shops", input.explicit));
        shopId = input.explicit;
        if (shop.exists()) {
          const d = shop.data();
          if (typeof d.ownerUid === "string" && d.ownerUid) {
            throw bad(409, "Shop is claimed", { code: "claimed", id: shopId, ...links(shopId), claimed: true });
          }
          if (d.externalKey && d.externalKey !== key) {
            throw bad(409, "Shop is bound to another externalSource", { code: "conflict", id: shopId });
          }
          data = d;
        }
      } else {
        const ids = candidateIds(input.source, input.sellerId);
        const snaps = [];
        for (const id of ids) snaps.push(await tx.get(doc(db, "shops", id)));
        for (let i = 0; i < ids.length; i++) {
          const d = snaps[i].exists() ? snaps[i].data() : null;
          if (d?.externalKey === key && !(typeof d.ownerUid === "string" && d.ownerUid)) {
            shopId = ids[i]; data = d; break;
          }
        }
        if (!shopId) {
          for (let i = 0; i < ids.length; i++) if (!snaps[i].exists()) { shopId = ids[i]; break; }
        }
        if (!shopId) throw bad(503, "No free shop id", { code: "unavailable" });
      }
      if (pointer.exists()) tx.update(pointerRef, { shopId });
      else tx.set(pointerRef, { shopId, source: input.source, sellerId: input.sellerId });
    }
    guard(data, shopId, opt);
    const rev = revOf(data) + 1;
    const held = leasePatch(data, opt, input.lease, input.leaseSeconds);
    const shopRef = doc(db, "shops", shopId);
    if (data) {
      const current = storeFromDocs(data, [], []);
      let settingPatch: Record<string, unknown> = {};
      try { settingPatch = input.settings ? settingsUpdate(current, input.settings) : {}; }
      catch (e) {
        if (e instanceof ShopBuilderError) throw e;
        throw bad(400, e instanceof Error ? e.message : "Invalid settings", { code: "validation" });
      }
      tx.update(shopRef, unclaimedShopWrite({
        ...settingPatch, externalKey: key, source: input.source, sellerId: input.sellerId,
        rev, updatedAt: opt.now, lastAgentId: opt.agentId, ...held,
      }));
    } else {
      const next = applyShopSettings(baseStore(), input.settings || {});
      next.rev = rev;
      next.externalKey = key;
      next.source = input.source;
      next.sellerId = input.sellerId;
      next.lastAgentId = opt.agentId;
      next.published = false;
      if (input.lease) {
        next.leaseAgentId = opt.agentId;
        next.leaseExpiresAt = addSeconds(opt.now, input.leaseSeconds ?? LIMITS.leaseSeconds);
      }
      const body = unclaimedShopWrite({ ...shopFields(next), updatedAt: opt.now });
      if (!input.lease) { body.leaseAgentId = null; body.leaseExpiresAt = null; }
      tx.set(shopRef, body);
    }
    return { shopId, rev, created: !data };
  });

  let kept: string[] = [];
  if (input.items) {
    await rehost(shell.shopId, input.items);
    kept = await applyOps(
      db, shell.shopId, input.items.map((item) => ({ op: "upsert", item })),
      { ...opt, ifMatch: undefined }, shell.rev, true,
    );
  }
  const state = await loadShop(db, shell.shopId, opt.now);
  state.created = shell.created;
  if (kept.length) state.kept = kept;
  return state;
}

async function dryUpsert(db: Firestore, input: UpsertIn, opt: Opt): Promise<ShopState> {
  const found = await peek(db, input.source, input.sellerId);
  if (found && input.explicit && input.explicit !== found.id) {
    throw bad(409, "externalSource is already bound to another shop", {
      code: "conflict", id: found.id, ...links(found.id),
    });
  }
  guard(found?.data || null, found?.id || input.explicit || "", opt);
  const current = found ? storeFromDocs(found.data, [], []) : baseStore();
  let settings = settingsOf(current);
  if (input.settings) {
    try { settings = settingsOf(applyShopSettings(current, input.settings)); }
    catch (e) {
      throw bad(400, e instanceof Error ? e.message : "Invalid settings", { code: "validation" });
    }
  }
  const id = found?.id || input.explicit || null;
  const loaded = found ? await loadShop(db, found.id, opt.now) : null;
  const items = input.items
    ? input.items.map((it) => ({
      id: loaded?.items.find((row) => row.externalKey === it.externalKey)?.id || null,
      externalKey: it.externalKey,
      name: it.fields.name ?? loaded?.items.find((row) => row.externalKey === it.externalKey)?.name ?? "",
      price: it.fields.price !== undefined ? it.fields.price
        : (loaded?.items.find((row) => row.externalKey === it.externalKey)?.price ?? null),
      note: it.fields.note !== undefined ? (it.fields.note || "")
        : (loaded?.items.find((row) => row.externalKey === it.externalKey)?.note ?? ""),
      photos: it.fields.photos ?? loaded?.items.find((row) => row.externalKey === it.externalKey)?.photos ?? [],
      paused: it.fields.paused !== undefined ? it.fields.paused
        : !!loaded?.items.find((row) => row.externalKey === it.externalKey)?.paused,
      availableAfter: it.fields.availableAfter !== undefined ? it.fields.availableAfter
        : (loaded?.items.find((row) => row.externalKey === it.externalKey)?.availableAfter ?? null),
      sold: loaded?.items.find((row) => row.externalKey === it.externalKey)?.sold ?? false,
    }))
    : (loaded?.items || []);
  return {
    id, rev: found ? revOf(found.data) : 0,
    ...(id ? links(id) : { url: null, editorUrl: null, path: null, editorPath: null }),
    claimed: false, published: false,
    externalSource: { source: input.source, sellerId: input.sellerId },
    lease: found ? activeLease(found.data, opt.now) : null,
    lastAgentId: found?.data.lastAgentId ? String(found.data.lastAgentId) : null,
    settings, items, dryRun: true,
  };
}

export async function upsertShop(db: Firestore, body: unknown, opt: Opt) {
  const input = parseUpsert(body);
  if (opt.dryRun || input.dryRun) return dryUpsert(db, input, opt);
  let last: unknown;
  for (let i = 0; i < 5; i++) {
    try { return await upsertOnce(db, input, opt); }
    catch (e) {
      last = e;
      const retry = e instanceof ShopBuilderError && e.extra.code === "revision_mismatch" && opt.ifMatch == null && i < 4;
      if (!retry) throw e;
    }
  }
  throw last;
}

export async function getShop(db: Firestore, shopId: string, now: string) {
  return loadShop(db, dig5(shopId), now);
}

export async function listShops(
  db: Firestore,
  q: { source?: string; sellerId?: string; lease?: string; limit?: number },
  now: string,
) {
  const lease = q.lease || "any";
  if (lease !== "any" && lease !== "free" && lease !== "held") {
    throw bad(400, "lease must be free, held, or any", { code: "validation" });
  }
  const cap = Math.min(LIMITS.listLimit, Math.max(1, q.limit || 20));
  let source = (q.source || "").trim().toLowerCase();
  const sellerId = (q.sellerId || "").trim();
  if (sellerId && !source) throw bad(400, "sellerId requires source", { code: "validation" });
  if (source && !SOURCE.test(source)) throw bad(400, "source is invalid", { code: "validation" });
  if (sellerId.length > 500) throw bad(400, "sellerId is invalid", { code: "validation" });
  const shops = collection(db, "shops");
  const snap = sellerId
    ? await getDocs(query(shops, where("externalKey", "==", externalKeyOf(source, sellerId)), limit(1)))
    : source
      ? await getDocs(query(shops, where("source", "==", source), limit(cap)))
      : await getDocs(query(shops, where("externalKey", ">", ""), limit(cap)));
  const out: ShopState[] = [];
  for (const d of snap.docs) {
    if (!/^\d{5}$/.test(d.id)) continue;
    const data = d.data();
    if (typeof data.ownerUid === "string" && data.ownerUid) continue;
    const held = activeLease(data, now);
    if (lease === "free" && held) continue;
    if (lease === "held" && !held) continue;
    const state = shopState(d.id, data, [], [], now);
    state.items = [];
    out.push(state);
  }
  return { shops: out.slice(0, cap) };
}

async function withShop(db: Firestore, shopId: string, opt: Opt, write: (tx: Transaction, ref: ReturnType<typeof doc>, meta: Record<string, unknown>) => void) {
  const id = dig5(shopId);
  await runTransaction(db, async (tx) => {
    const ref = doc(db, "shops", id);
    const shop = await tx.get(ref);
    const meta = shop.exists() ? shop.data() : null;
    mustExist(meta, id, opt);
    write(tx, ref, meta!);
  });
  return loadShop(db, id, opt.now);
}

export async function acquireLease(db: Firestore, shopId: string, seconds: number | undefined, opt: Opt) {
  const ttl = seconds == null ? LIMITS.leaseSeconds : seconds;
  if (!Number.isInteger(ttl) || ttl < 60 || ttl > LIMITS.leaseSeconds) {
    throw bad(400, `lease seconds must be an integer from 60 to ${LIMITS.leaseSeconds}`, { code: "validation" });
  }
  if (opt.dryRun) {
    const shop = await getShop(db, shopId, opt.now);
    const meta = { ownerUid: shop.claimed ? "x" : "", leaseAgentId: shop.lease?.agentId, leaseExpiresAt: shop.lease?.expiresAt, rev: shop.rev };
    guard(shop.claimed ? { ownerUid: "x", rev: shop.rev } : meta, shop.id || "", opt);
    return { ...shop, dryRun: true, lease: { agentId: opt.agentId, expiresAt: addSeconds(opt.now, ttl) } };
  }
  return withShop(db, shopId, opt, (tx, ref, meta) => {
    tx.update(ref, unclaimedShopWrite({
      ...leasePatch(meta, opt, true, ttl),
      rev: revOf(meta) + 1, updatedAt: opt.now, lastAgentId: opt.agentId,
    }));
  });
}

export async function releaseLease(db: Firestore, shopId: string, opt: Opt) {
  if (opt.dryRun) return { ...(await getShop(db, shopId, opt.now)), dryRun: true, lease: null };
  const id = dig5(shopId);
  await runTransaction(db, async (tx) => {
    const ref = doc(db, "shops", id);
    const shop = await tx.get(ref);
    const meta = shop.exists() ? shop.data() : null;
    mustExist(meta, id, opt);
    const lease = activeLease(meta, opt.now);
    if (!lease) return;
    if (lease.agentId !== opt.agentId) {
      throw bad(423, "Lease held", { code: "lease_held", id, ...links(id), lease, rev: revOf(meta) });
    }
    tx.update(ref, unclaimedShopWrite({
      leaseAgentId: null, leaseExpiresAt: null,
      rev: revOf(meta) + 1, updatedAt: opt.now, lastAgentId: opt.agentId,
    }));
  });
  return loadShop(db, id, opt.now);
}

export async function putItem(db: Firestore, shopId: string, itemKey: string, body: unknown, opt: Opt) {
  const id = dig5(shopId);
  const key = parseItemKey(itemKey);
  const o = asObj(body, "body");
  rejectUnsafe(o, "body");
  const item = parseItem(o, "body", key);
  if (opt.dryRun) {
    const shop = await loadShop(db, id, opt.now);
    guard(shop.claimed ? { ownerUid: "x", rev: shop.rev } : { rev: shop.rev, leaseAgentId: shop.lease?.agentId, leaseExpiresAt: shop.lease?.expiresAt }, id, opt);
    return { ...shop, dryRun: true };
  }
  await rehost(id, [item]);
  await applyOps(db, id, [{ op: "upsert", item }], opt, null, false);
  return loadShop(db, id, opt.now);
}

export async function deleteItem(db: Firestore, shopId: string, itemKey: string, opt: Opt) {
  const id = dig5(shopId);
  const externalKey = parseItemKey(itemKey);
  if (opt.dryRun) {
    const shop = await loadShop(db, id, opt.now);
    guard({ rev: shop.rev, leaseAgentId: shop.lease?.agentId, leaseExpiresAt: shop.lease?.expiresAt, ...(shop.claimed ? { ownerUid: "x" } : {}) }, id, opt);
    return { ...shop, dryRun: true };
  }
  await applyOps(db, id, [{ op: "delete", externalKey }], opt, null, false);
  return loadShop(db, id, opt.now);
}

export async function batchItems(db: Firestore, shopId: string, body: unknown, opt: Opt) {
  const id = dig5(shopId);
  const o = asObj(body, "body");
  rejectUnsafe(o, "body");
  unknown(o, ["ops", "dryRun"], "body");
  if (!Array.isArray(o.ops)) throw bad(400, "ops must be an array", { code: "validation" });
  if (o.ops.length > LIMITS.itemsPerRequest) {
    throw bad(400, `ops exceeds ${LIMITS.itemsPerRequest}`, { code: "validation" });
  }
  const ops: ItemOp[] = o.ops.map((row, i) => {
    const op = asObj(row, `ops[${i}]`);
    if (op.op !== "upsert" && op.op !== "delete") throw bad(400, `ops[${i}].op is invalid`, { code: "validation" });
    if (op.op === "delete") {
      unknown(op, ["op", "externalKey"], `ops[${i}]`);
      return { op: "delete", externalKey: parseItemKey(String(op.externalKey || "")) };
    }
    const { op: _op, ...rest } = op;
    return { op: "upsert", item: parseItem(rest, `ops[${i}]`) };
  });
  if (opt.dryRun || o.dryRun === true) {
    const shop = await loadShop(db, id, opt.now);
    guard({ rev: shop.rev, leaseAgentId: shop.lease?.agentId, leaseExpiresAt: shop.lease?.expiresAt, ...(shop.claimed ? { ownerUid: "x" } : {}) }, id, opt);
    return { ...shop, dryRun: true };
  }
  await rehost(id, ops.flatMap((op) => op.op === "upsert" ? [op.item] : []));
  await applyOps(db, id, ops, opt, null, false);
  return loadShop(db, id, opt.now);
}

export async function savePhoto(db: Firestore, shopId: string, req: Request, opt: Opt) {
  const id = dig5(shopId);
  const stub = process.env.SHOP_BUILDER_PHOTO_STUB === "1";
  const type = req.headers.get("content-type") || "";
  let itemKey = "";
  let file: File | null = null;
  let url = "";
  if (type.includes("multipart/form-data")) {
    const form = await req.formData();
    const got = form.get("file");
    if (!(got instanceof File)) throw bad(400, "file required", { code: "validation" });
    file = got;
    itemKey = String(form.get("itemKey") || "");
  } else {
    const body = asObj(await req.json().catch(() => { throw bad(400, "Invalid JSON", { code: "validation" }); }), "body");
    rejectUnsafe(body, "body");
    unknown(body, ["url", "itemKey", "dryRun"], "body");
    if (typeof body.url !== "string" || !body.url.trim()) throw bad(400, "url required", { code: "validation" });
    url = body.url.trim();
    itemKey = typeof body.itemKey === "string" ? body.itemKey : "";
    if (body.dryRun === true) opt = { ...opt, dryRun: true };
  }
  if (itemKey) itemKey = parseItemKey(itemKey);
  if (itemKey && opt.ifMatch == null && !opt.dryRun) {
    throw bad(428, "If-Match is required", { code: "precondition_required" });
  }
  if (opt.dryRun) {
    if (file) {
      const stored = await storeShopPhoto(id, itemKey || "preview", file, { dry: true });
      return { dryRun: true, itemKey: itemKey || null, bytesIn: stored.bytesIn, bytesOut: stored.bytesOut };
    }
    if (!isStoredPhoto(url)) {
      let parsed: URL;
      try { parsed = new URL(url); }
      catch { throw bad(400, "Photo URL is invalid", { code: "validation" }); }
      if (parsed.protocol !== "https:") throw bad(400, "Photo URL must be https", { code: "validation" });
    }
    return { dryRun: true, itemKey: itemKey || null, url };
  }
  const snap = await getDoc(doc(db, "shops", id));
  mustExist(snap.exists() ? snap.data() : null, id, { ...opt, ifMatch: itemKey ? opt.ifMatch : undefined });
  let stored: { url: string; bytesIn: number; bytesOut: number };
  try {
    stored = file
      ? await storeShopPhoto(id, itemKey ? itemDocId(itemKey) : `upl${Date.now()}`, file, { stub })
      : { url: await storeShopPhotoFromUrl(id, itemKey ? itemDocId(itemKey) : `upl${Date.now()}`, url, { stub }), bytesIn: 0, bytesOut: 0 };
  } catch (e) {
    if (e instanceof BlobPhotoError) throw bad(e.status, e.message, { code: "validation" });
    throw e;
  }
  if (!itemKey) {
    const shop = await loadShop(db, id, opt.now);
    return { ...shop, photo: { url: stored.url, bytesIn: stored.bytesIn, bytesOut: stored.bytesOut } };
  }
  const existing = await getDocs(collection(db, "shops", id, "items"));
  const itemId = existing.docs.find((d) => d.data().externalKey === itemKey)?.id || "";
  if (!itemId) throw bad(404, "Item not found", { code: "not_found" });
  await runTransaction(db, async (tx) => {
    const shopRef = doc(db, "shops", id);
    const shop = await tx.get(shopRef);
    const meta = shop.exists() ? shop.data() : null;
    mustExist(meta, id, opt);
    const item = await tx.get(doc(db, "shops", id, "items", itemId));
    if (!item.exists() || item.data()?.externalKey !== itemKey) throw bad(404, "Item not found", { code: "not_found" });
    tx.update(item.ref, { photos: arrayUnion(stored.url) });
    tx.update(shopRef, unclaimedShopWrite({ rev: revOf(meta) + 1, updatedAt: opt.now, lastAgentId: opt.agentId }));
  });
  const shop = await loadShop(db, id, opt.now);
  return { ...shop, photo: { url: stored.url, bytesIn: stored.bytesIn, bytesOut: stored.bytesOut } };
}
