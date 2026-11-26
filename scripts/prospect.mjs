/**
 * Pure helpers for the Facebook prospect pipeline.
 * No browser, no network, no API token. See docs/prospect-pipeline.md.
 */
import path from "node:path";

export const SOURCE = "facebook_marketplace";
export const MAX_ITEMS = 40;
export const MAX_SCROLLS = 6;
export const PACE_MIN = 1800;
export const PACE_MAX = 3200;
/** Keep in sync with PICKUP_SLOTS in lib/sale.ts. */
export const SLOT_MORNING = "10:00";
export const SLOT_AFTERNOON = "14:00";
export const SLOT_EVENING = "20:00";
export const SHOT = { width: 1280, height: 830, quality: 82, langKey: "ss-lang" };
/** Messenger copy lives with the operator. The queue only names the next letter. */
export const VARIANT_CYCLE = ["A", "D", "C", "B"];
/** Elton, 2026-11-26: the next send is B. */
export const VARIANT_NEXT = "B";

const ITEM_LINE = /^.{2,80}?\s*[-–—:：]\s*(?:¥|￥)?\s*\d[\d,]*\s*(?:円|yen)\s*$/i;
const BULLET_LINE = /^(?:[・\-*]|[0-9]+[.)])\s*.{1,80}?\d[\d,]*\s*(?:円|yen)\s*$/i;
const INLINE_LINE = /[^\n,、]{2,60}?\s*[-–—:：]\s*(?:¥|￥)?\s*\d[\d,]*\s*(?:円|yen)/gi;

export function parseArgs(argv) {
  const flags = {};
  const _ = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) { _.push(a); continue; }
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next == null || next.startsWith("--")) flags[key] = true;
    else { flags[key] = next; i += 1; }
  }
  return { flags, _ };
}

export function paceMs(rand = Math.random) {
  return PACE_MIN + Math.floor(rand() * (PACE_MAX - PACE_MIN + 1));
}

export function assertLocalCdp(endpoint) {
  const u = new URL(endpoint);
  if (u.protocol !== "http:" && u.protocol !== "ws:") {
    throw new Error("CDP URL must be http://127.0.0.1:9222");
  }
  if (!["127.0.0.1", "localhost", "::1"].includes(u.hostname)) {
    throw new Error("CDP must be on localhost. This script will not attach to a remote browser.");
  }
  return u.toString();
}

/** Production unless `--beta`. An explicit SHOP_BUILDER_API_BASE is kept when beta is off. */
export function resolveBase(envBase, { beta = false } = {}) {
  if (beta) return "https://beta.sayonara.tokyo";
  return String(envBase || "https://sayonara.tokyo").replace(/\/$/, "");
}

export function assertAgentId(id) {
  const s = String(id || "").trim();
  if (!/^[A-Za-z0-9._:-]{1,80}$/.test(s)) {
    throw new Error("Set SHOP_BUILDER_AGENT_ID (same rule as shop-builder.mjs)");
  }
  return s;
}

export function redact(text, secret) {
  let s = String(text ?? "");
  if (secret) s = s.split(secret).join("[redacted]");
  return s.replace(/Bearer\s+\S+/gi, "Bearer [redacted]");
}

export function outputWarning(abs, repoRoot) {
  const rel = path.relative(repoRoot, abs);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) return "";
  if (rel === "data" || rel.startsWith(`data${path.sep}`)) return "";
  return `warning: ${rel} is inside the repo and not under data/ — do not commit seller data`;
}

/**
 * Assign variants in cycle order. `next` is the letter for the first new row.
 * A shopUrl already in `kept` keeps that letter and does not advance the cursor.
 */
export function assignVariants(rows, { next = VARIANT_NEXT, kept = new Map() } = {}) {
  let i = VARIANT_CYCLE.indexOf(next);
  if (i < 0) i = VARIANT_CYCLE.indexOf(VARIANT_NEXT);
  const sends = [];
  for (const row of rows) {
    const prev = kept.get(row.shopUrl);
    if (prev && VARIANT_CYCLE.includes(prev)) {
      sends.push({ ...row, variant: prev });
      continue;
    }
    sends.push({ ...row, variant: VARIANT_CYCLE[i] });
    i = (i + 1) % VARIANT_CYCLE.length;
  }
  return { sends, next: VARIANT_CYCLE[i] };
}

/** Same rule as wardAddress in lib/store.ts. 市/町/村 stay; a bare ward gains 区. */
export function wardStored(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  if (/[市町村]$/.test(s)) return s;
  const stem = s.replace(/区$/, "");
  return stem ? `${stem}区` : "";
}

export function canonicalFacebookUrl(raw) {
  const u = new URL(String(raw || "").trim());
  const host = u.hostname.toLowerCase();
  const fb = host === "facebook.com" || host.endsWith(".facebook.com") || host === "fb.com" || host.endsWith(".fb.com");
  if (!fb) throw new Error("Not a facebook.com URL");
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("URL must be http(s)");
  u.protocol = "https:";
  u.hostname = "www.facebook.com";
  u.hash = "";
  u.search = "";
  let pathname = u.pathname.replace(/\/+$/, "");
  const item = pathname.match(/\/marketplace\/item\/(\d+)/);
  const prof = pathname.match(/\/marketplace\/profile\/(\d+)/);
  if (item) pathname = `/marketplace/item/${item[1]}`;
  else if (prof) pathname = `/marketplace/profile/${prof[1]}`;
  u.pathname = pathname || "/";
  return u.toString();
}

export function profileIdFromUrl(raw) {
  return String(raw || "").match(/\/marketplace\/profile\/(\d{6,})/)?.[1] || "";
}
export function itemIdFromUrl(raw) {
  return String(raw || "").match(/\/marketplace\/item\/(\d{6,})/)?.[1] || "";
}
export function itemUrl(id) {
  return `https://www.facebook.com/marketplace/item/${id}`;
}
/** Contact link the reserve form opens. Always an item URL, with the trailing slash. */
export function listingContactUrl(id) {
  return `https://www.facebook.com/marketplace/item/${id}/`;
}

export function assertGrabUrls(urls) {
  if (!urls.length) throw new Error("Pass a Marketplace profile URL or one or more item URLs");
  if (urls.length > MAX_ITEMS) throw new Error(`At most ${MAX_ITEMS} URLs`);
  for (const raw of urls) {
    const u = new URL(raw);
    if (/\/marketplace\/(search|category)\b/.test(u.pathname) || u.pathname.startsWith("/search")) {
      throw new Error("Search and category URLs are not accepted. Pass one seller profile or explicit item URLs.");
    }
    if (!/\/marketplace\/(?:item|profile)\/\d{6,}$/.test(u.pathname)) {
      throw new Error("URL must be a Marketplace profile or item id");
    }
  }
}

export function isGraphqlUrl(raw) {
  try {
    const pathname = new URL(raw).pathname;
    return /\/api\/graphql\/?$/.test(pathname) || pathname.endsWith("/graphql");
  } catch {
    return false;
  }
}

/** Login and rate walls only. A normal page that mentions login is not a wall. */
export function pageBlock(url, html) {
  let pathname = "";
  try { pathname = new URL(String(url || "")).pathname; }
  catch { pathname = String(url || ""); }
  if (/^\/(login|checkpoint|two_factor)(\/|$)/.test(pathname)) return "login";
  if (/temporarily blocked|going too fast/i.test(String(html || ""))) return "rate";
  return "";
}

function normNum(raw) {
  return String(raw ?? "")
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/[，,]/g, "")
    .trim();
}

/** Yen only when the text is marked as yen, free, or 無料. Bare numbers and other currencies are null. */
export function yenMarked(raw) {
  const s = normNum(raw);
  if (!s) return null;
  if (/[$€£]/.test(s)) return null;
  if (/(^|\s)(無料|free)(\s|$)/i.test(s) && !/[1-9]/.test(s)) return 0;
  if (!/(¥|￥|円|yen)/i.test(s)) return null;
  const m = s.match(/(\d+)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

export function cleanTitle(raw) {
  return String(raw || "").replace(/\s*[|｜]\s*Facebook\s*$/i, "").trim();
}

export function nameFromTitle(title) {
  const s = cleanTitle(title);
  const stripped = s
    .replace(/\s*(?:[-–—|｜]\s*)?(?:¥|￥)\s*[\d,]+\s*$/u, "")
    .replace(/\s*[\d,]+\s*(?:円|yen)\s*$/iu, "")
    .trim();
  return stripped || s;
}

export function bundleLines(text) {
  const rows = String(text || "").split(/\n/).map((s) => s.trim()).filter(Boolean);
  const lines = rows.filter((s) => s.length <= 80 && (ITEM_LINE.test(s) || BULLET_LINE.test(s)));
  if (lines.length >= 2) return lines;
  const inline = String(text || "").match(new RegExp(INLINE_LINE.source, "gi")) || [];
  return inline.length >= 2 ? inline.map((s) => s.trim()) : [];
}

function matched(text, re) {
  return String(text || "").match(re) || [];
}

function hhmm(total) {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Three times, 90 minutes apart, starting 30 minutes after `afterMin`. after 17:00 → 17:30, 19:00, 20:30. */
export function slotsAfter(afterMin, endMin = 21 * 60) {
  const out = [];
  for (let t = afterMin + 30; t <= endMin && out.length < 3; t += 90) out.push(hhmm(t));
  return out;
}

function hourOf(phrase) {
  const s = String(phrase);
  let m = s.match(/after\s*(\d{1,2})\s*p\.?m\.?/i);
  if (m) return (Number(m[1]) % 12) + 12;
  m = s.match(/after\s*(\d{1,2})\b/i);
  if (m) return Number(m[1]);
  m = s.match(/午後\s*(\d{1,2})\s*時/);
  if (m) return (Number(m[1]) % 12) + 12;
  m = s.match(/(\d{1,2})\s*時以降/);
  if (m) return Number(m[1]);
  return null;
}

/**
 * No time phrase → null (the shop keeps 10:00, 14:00, 20:00).
 * One window → slots that fit it. Mixed phrases → slots null, so the build waits.
 */
export function slotConstraint(text) {
  const evening = matched(text, /after\s*(?:5|6|7|8)\s*p\.?m\.?|after\s*(?:17|18|19|20)\b|(?:17|18|19|20)\s*時以降|午後\s*(?:5|6|7|8)\s*時以降|夕方(?:以降|のみ|だけ)|夜(?:のみ|だけ)|evenings?\s+only/gi);
  const morning = matched(text, /mornings?\s+only|午前(?:中)?(?:のみ|だけ)|before\s+noon/gi);
  const afternoon = matched(text, /afternoons?\s+only|昼(?:のみ|だけ)/gi);
  const raw = [...new Set([...evening, ...morning, ...afternoon])];
  if (!raw.length) return null;
  const kinds = [
    evening.length ? "evening" : "",
    morning.length ? "morning" : "",
    afternoon.length ? "afternoon" : "",
  ].filter(Boolean);
  if (kinds.length !== 1) {
    return { raw, slots: null, reason: "Time phrases disagree. The 10:00/14:00/20:00 defaults were not used. Set settings.slots." };
  }
  let afterMin;
  let endMin;
  if (kinds[0] === "evening") {
    const hours = [...new Set(evening.map(hourOf).filter((h) => h != null))];
    if (hours.length > 1) {
      return { raw, slots: null, reason: "More than one evening time. The defaults were not used. Set settings.slots." };
    }
    afterMin = (hours[0] ?? 17) * 60;
    endMin = 21 * 60;
  } else if (kinds[0] === "morning") {
    afterMin = 8 * 60;
    endMin = 12 * 60;
  } else {
    afterMin = 12 * 60;
    endMin = 17 * 60;
  }
  const slots = slotsAfter(afterMin, endMin);
  return {
    raw,
    slots,
    reason: `Generated from the listing text (${raw.join(", ")}). Edit settings.slots if the window is wrong.`,
  };
}

export function datePhrases(text) {
  const m = String(text || "").match(/\d{4}-\d{2}-\d{2}|[0-9０-９]{1,2}\s*月\s*[0-9０-９]{1,2}\s*日|月末/g);
  return m ? [...new Set(m)] : [];
}

export function itemFieldsFromListing(listing) {
  const title = cleanTitle(listing?.title || "");
  const name = nameFromTitle(title);
  const titlePrice = yenMarked(title);
  const listed = typeof listing?.price === "number" && Number.isFinite(listing.price)
    ? listing.price
    : yenMarked(listing?.priceText);
  if (titlePrice != null && listed != null && titlePrice !== listed) {
    return { name, price: null, warning: `price conflict: title ${titlePrice} vs listing ${listed}` };
  }
  if (titlePrice != null) return { name, price: titlePrice, warning: "" };
  if (listed != null) return { name, price: listed, warning: "" };
  return { name, price: null, warning: "price missing" };
}

function asText(v) {
  if (typeof v === "string") return v.trim();
  if (v && typeof v === "object" && typeof v.text === "string") return v.text.trim();
  return "";
}
function num(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}
function idFromAny(v) {
  const s = String(v ?? "");
  if (/^\d{6,}$/.test(s)) return s;
  if (!s || s.length > 240) return "";
  if (/^[A-Za-z0-9+/=_-]{8,}$/.test(s)) {
    try {
      const dec = Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
      const m = dec.match(/(\d{6,})/);
      if (m) return m[1];
    } catch { /* not base64 */ }
  }
  return "";
}
function listingIdOf(node) {
  for (const c of [node.id, node.for_sale_item_id, node.listing_id]) {
    const id = idFromAny(c);
    if (id) return id;
  }
  return "";
}
function sellerOf(node) {
  const s = node.marketplace_listing_seller || node.seller || null;
  return {
    id: idFromAny(s?.id || s?.user_id || node.seller_id || ""),
    name: asText(s?.name),
  };
}
function priceFromNode(node) {
  const lp = node.listing_price;
  if (lp && typeof lp === "object") {
    const currency = String(lp.currency || lp.currency_code || "JPY").toUpperCase();
    const formatted = asText(lp.formatted_amount) || asText(lp.formatted_amount_zeros_stripped);
    if (currency !== "JPY") return { price: null, priceText: formatted };
    if (formatted) return { price: yenMarked(formatted), priceText: formatted };
    const amount = Number(String(lp.amount ?? "").replace(/,/g, ""));
    if (Number.isFinite(amount)) return { price: Math.round(amount), priceText: `¥${Math.round(amount)}` };
  }
  const formatted = asText(node.formatted_price);
  if (formatted) return { price: yenMarked(formatted), priceText: formatted };
  return { price: null, priceText: "" };
}

function photoScore(p) {
  if (p.width && p.height) return p.width * p.height;
  const m = String(p.url).match(/[sp](\d+)x(\d+)/);
  if (m) return Number(m[1]) * Number(m[2]);
  return 1_000_000;
}
function photoKey(url) {
  try { return new URL(url).pathname; }
  catch { return url; }
}
export function dedupePhotos(list) {
  const best = new Map();
  for (const p of list) {
    if (!p?.url) continue;
    const key = photoKey(p.url);
    const prev = best.get(key);
    const better = !prev
      || (prev.weak && !p.weak)
      || (prev.weak === p.weak && photoScore(p) > photoScore(prev));
    if (better) best.set(key, p);
  }
  let photos = [...best.values()].sort((a, b) => photoScore(b) - photoScore(a));
  const strong = photos.filter((p) => !p.weak && (photoScore(p) >= 500 * 500));
  if (strong.length) photos = photos.filter((p) => !p.weak && photoScore(p) >= 500 * 500);
  else if (photos.some((p) => !p.weak)) photos = photos.filter((p) => !p.weak);
  return photos.slice(0, 12);
}
function collectPhotos(root) {
  const acc = [];
  const seen = new WeakSet();
  function walk(n, depth, nested) {
    if (!n || typeof n !== "object" || depth > 8 || seen.has(n)) return;
    seen.add(n);
    if (Array.isArray(n)) {
      for (const x of n) walk(x, depth + 1, nested);
      return;
    }
    if (nested && (typeof n.marketplace_listing_title === "string" || n.marketplace_listings)) return;
    if (typeof n.uri === "string" && /^https:/.test(n.uri) && /fbcdn\.net|scontent/.test(n.uri)) {
      acc.push({ url: n.uri, width: num(n.width), height: num(n.height), weak: false });
    }
    for (const v of Object.values(n)) if (v && typeof v === "object") walk(v, depth + 1, true);
  }
  walk(root, 0, false);
  return dedupePhotos(acc);
}
function normalizeNode(node) {
  const title = cleanTitle(asText(node.marketplace_listing_title) || asText(node.custom_title));
  if (!title) return null;
  const id = listingIdOf(node);
  if (!id) return null;
  const price = priceFromNode(node);
  const seller = sellerOf(node);
  let status = "active";
  if (node.is_sold === true || node.is_hidden === true) status = "sold";
  else if (node.is_pending === true) status = "pending";
  return {
    id,
    url: itemUrl(id),
    title,
    price: price.price,
    priceText: price.priceText,
    description: asText(node.redacted_description) || asText(node.listing_description) || asText(node.description),
    locationText: asText(node.location_text) || asText(node.location?.reverse_geocode?.city),
    photos: collectPhotos(node),
    status,
    sellerId: seller.id,
    sellerName: seller.name,
  };
}

export function extractNodes(root) {
  const found = [];
  const seen = new WeakSet();
  function walk(node, depth) {
    if (!node || typeof node !== "object" || depth > 40 || seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
      for (const x of node) walk(x, depth + 1);
      return;
    }
    const norm = normalizeNode(node);
    if (norm) found.push(norm);
    for (const v of Object.values(node)) if (v && typeof v === "object") walk(v, depth + 1);
  }
  walk(root, 0);
  return mergeAll([], found);
}

function decodeHtml(s) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, "&").replace(/&quot;/g, "\"").replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}
function meta(html, prop) {
  const src = String(html || "");
  const res = [
    new RegExp(`<meta[^>]+property=["']${prop}["'][^>]+content=["']([^"']*)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+property=["']${prop}["']`, "i"),
  ];
  for (const re of res) {
    const m = src.match(re);
    if (m) return decodeHtml(m[1]);
  }
  return "";
}

export function domListing(html, pageUrl) {
  const id = itemIdFromUrl(pageUrl) || itemIdFromUrl(meta(html, "og:url"));
  const title = cleanTitle(meta(html, "og:title"));
  if (!id || !title) return null;
  const image = meta(html, "og:image");
  const marked = title.match(/(?:¥|￥)\s*[\d,]+|[\d,]+\s*(?:円|yen)/i);
  return {
    id,
    url: itemUrl(id),
    title,
    price: yenMarked(title),
    priceText: marked ? marked[0] : "",
    description: meta(html, "og:description"),
    locationText: "",
    photos: image && /^https:/.test(image) ? [{ url: image, width: 0, height: 0, weak: true }] : [],
    status: "active",
    sellerId: "",
    sellerName: "",
  };
}

export function blobsFromHtml(html) {
  const out = [];
  for (const m of String(html || "").matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)) {
    const body = m[1].trim();
    if (!body || body.length > 8_000_000 || (body[0] !== "{" && body[0] !== "[")) continue;
    if (!body.includes("marketplace_listing_title") && !body.includes("listing_price")) continue;
    try { out.push(JSON.parse(body)); }
    catch { /* FB sometimes wraps JSON in JS */ }
  }
  return out;
}

export function itemIdsFromHtml(html) {
  const ids = [];
  for (const m of String(html || "").matchAll(/\/marketplace\/item\/(\d{6,})/g)) {
    if (!ids.includes(m[1])) ids.push(m[1]);
    if (ids.length >= 80) break;
  }
  return ids;
}

function mergeListing(a, b) {
  const rank = { active: 0, pending: 1, sold: 2 };
  const status = (rank[b.status] || 0) >= (rank[a.status] || 0) ? (b.status || a.status) : a.status;
  const description = (b.description || "").length > (a.description || "").length ? b.description : (a.description || "");
  const title = (b.title || "").length > (a.title || "").length ? b.title : (a.title || b.title || "");
  const price = b.price != null ? b.price : a.price;
  const priceText = b.price != null ? (b.priceText || a.priceText || "") : (a.priceText || b.priceText || "");
  const locationText = (b.locationText || "").length > (a.locationText || "").length ? b.locationText : (a.locationText || "");
  let sellerId = a.sellerId || b.sellerId || "";
  if (a.sellerId && b.sellerId && a.sellerId !== b.sellerId) sellerId = b.sellerId;
  return {
    id: a.id || b.id,
    url: a.url || b.url || itemUrl(a.id || b.id),
    title,
    price,
    priceText,
    description,
    locationText,
    photos: dedupePhotos([...(a.photos || []), ...(b.photos || [])]),
    status: status || "active",
    sellerId,
    sellerName: b.sellerName || a.sellerName || "",
  };
}
function mergeAll(base, extra) {
  const map = new Map();
  for (const row of [...base, ...extra]) {
    if (!row?.id) continue;
    const prev = map.get(row.id);
    map.set(row.id, prev ? mergeListing(prev, row) : row);
  }
  return [...map.values()];
}
function stubListing(id) {
  return {
    id, url: itemUrl(id), title: "", price: null, priceText: "", description: "",
    locationText: "", photos: [], status: "active", sellerId: "", sellerName: "",
  };
}
function absorb(page, profileId, onlyItemId) {
  const blobs = [...(page?.graphql || []), ...blobsFromHtml(page?.html || "")];
  let nodes = blobs.flatMap((b) => extractNodes(b));
  if (onlyItemId) nodes = nodes.filter((n) => n.id === onlyItemId);
  else if (profileId) nodes = nodes.filter((n) => !n.sellerId || n.sellerId === profileId);
  if (profileId && !onlyItemId) {
    for (const id of itemIdsFromHtml(page?.html || "")) {
      if (!nodes.some((n) => n.id === id)) nodes.push(stubListing(id));
    }
  }
  if (onlyItemId && !nodes.some((n) => n.id === onlyItemId)) {
    const dom = domListing(page?.html || "", page?.url || "");
    if (dom && dom.id === onlyItemId) nodes.push(dom);
  }
  return nodes;
}
function needsItemPage(l) {
  if (!l || l.status !== "active" || !l.url) return false;
  if (!l.title || !l.description) return true;
  if (!l.photos?.length || l.photos.some((p) => p.weak)) return true;
  return Math.max(...l.photos.map(photoScore)) < 500 * 500;
}
function publishListing(l) {
  const description = l.description || "";
  return {
    id: l.id,
    url: l.url,
    title: l.title || "",
    price: l.price == null ? null : l.price,
    priceText: l.priceText || "",
    description,
    locationText: l.locationText || "",
    photos: (l.photos || []).map((p) => {
      const out = { url: p.url };
      if (p.width) out.width = p.width;
      if (p.height) out.height = p.height;
      if (p.file) out.file = p.file;
      return out;
    }),
    status: l.status || "active",
    bundleHint: bundleLines(description).length >= 2,
  };
}
function loginError() {
  const err = new Error("Facebook is showing a login or checkpoint page. This script does not log in.");
  err.code = "login";
  return err;
}

/**
 * One seller, one pass. `session.open` / `session.scroll` return
 * `{ url, html, graphql, block? }`. This function does not sleep unless `sleep` is passed.
 */
export async function runGrab(opts) {
  const session = opts?.session;
  if (!session || typeof session.open !== "function") throw new Error("session.open is required");
  const sleep = opts.sleep || (async () => {});
  const now = opts.now || (() => new Date().toISOString());
  const max = Math.min(MAX_ITEMS, Math.max(1, Number(opts.max) || MAX_ITEMS));
  const maxScrolls = opts.maxScrolls ?? MAX_SCROLLS;
  const list = (opts.urls || []).map((u) => canonicalFacebookUrl(u));
  assertGrabUrls(list);
  const entry = list[0];
  const profileId = profileIdFromUrl(entry);
  let stopped = null;
  const seen = new Set();

  async function load(url, onlyItemId, gap) {
    if (stopped === "rate") return [];
    const c = canonicalFacebookUrl(url);
    if (seen.has(c)) return [];
    seen.add(c);
    if (gap) await sleep();
    const page = await session.open(c);
    const block = page?.block || pageBlock(page?.url, page?.html);
    if (block === "login") throw loginError();
    const nodes = absorb(page, profileId, onlyItemId);
    if (block === "rate") stopped = "rate";
    return nodes;
  }

  let listings = await load(entry, itemIdFromUrl(entry), false);
  if (profileId && !stopped && typeof session.scroll === "function") {
    let stable = 0;
    for (let i = 0; i < maxScrolls && listings.length < max && !stopped; i++) {
      await sleep();
      const page = await session.scroll();
      const block = page?.block || pageBlock(page?.url, page?.html);
      if (block === "login") throw loginError();
      if (block === "rate") { stopped = "rate"; break; }
      const before = listings.length;
      listings = mergeAll(listings, absorb(page, profileId, ""));
      stable = listings.length === before ? stable + 1 : 0;
      if (stable >= 2) break;
    }
  }
  for (const u of list.slice(1)) {
    if (stopped || listings.length >= max) break;
    listings = mergeAll(listings, await load(u, itemIdFromUrl(u), true));
  }
  if (profileId) {
    for (const row of [...listings]) {
      if (stopped || !needsItemPage(row)) continue;
      listings = mergeAll(listings, await load(row.url, row.id, true));
    }
  }

  const sellerIds = [...new Set(listings.map((l) => l.sellerId).filter(Boolean))];
  if (!profileId && sellerIds.length > 1) {
    throw Object.assign(new Error("These URLs belong to more than one seller. Grab one seller at a time."), { code: "sellers" });
  }
  if (!profileId && list.length > 1 && sellerIds.length !== 1) {
    throw Object.assign(new Error("Could not read one seller id. Pass the Marketplace profile URL."), { code: "sellers" });
  }
  if (profileId) listings = listings.filter((l) => !l.sellerId || l.sellerId === profileId);
  if (listings.length > max) {
    listings = listings.slice(0, max);
    if (!stopped) stopped = "cap";
  }
  const sellerId = profileId || sellerIds[0] || "";
  return {
    v: 1,
    grabbedAt: now(),
    entryUrl: entry,
    profileUrl: sellerId ? `https://www.facebook.com/marketplace/profile/${sellerId}` : "",
    sellerId,
    sellerName: listings.map((l) => l.sellerName).find(Boolean) || "",
    stopped,
    listings: listings.map(publishListing),
  };
}

const MOVE_OUT = /引っ越し|引越し|退去|転居|move-?out|moving/i;

function contactRank(listing) {
  const text = `${listing.title || ""}\n${listing.description || ""}`;
  if (listing.bundleHint || bundleLines(listing.description || "").length >= 2) return 0;
  if (MOVE_OUT.test(text)) return 1;
  return 2;
}

/** Entry item URL wins. A profile picks a bundle, then a move-out post, then the first active listing. */
export function pickContact(grab, active) {
  const entryId = itemIdFromUrl(grab?.entryUrl || "");
  const entry = entryId && active.find((l) => String(l.id) === entryId);
  if (entry) return { listing: entry, from: "entry" };
  const best = [...active].sort((a, b) => contactRank(a) - contactRank(b))[0];
  const rank = contactRank(best);
  return { listing: best, from: rank === 0 ? "bundle" : rank === 1 ? "move-out" : "first-active" };
}
function sourceSellerId(grab) {
  const id = String(grab.sellerId || "").match(/\d{6,}/)?.[0] || "";
  if (id) return `https://www.facebook.com/marketplace/profile/${id}`;
  if (grab.profileUrl) return canonicalFacebookUrl(grab.profileUrl);
  if (grab.entryUrl) return canonicalFacebookUrl(grab.entryUrl);
  throw new Error("seller id is missing");
}

/** Deterministic shop-builder JSON. Does not set address or dates, and does not split bundles. */
export function convertGrab(grab) {
  if (!grab || !Array.isArray(grab.listings)) throw new Error("grab JSON has no listings");
  const active = grab.listings.filter((l) => l && l.status !== "sold" && l.status !== "pending" && String(l.title || "").trim());
  if (!active.length) throw new Error("No active listings to convert");
  const picked = pickContact(grab, active);
  const listingId = String(picked.listing?.id || "");
  if (!/^\d{6,}$/.test(listingId)) throw new Error("facebookUrl requires a Marketplace listing id");
  const facebookUrl = listingContactUrl(listingId);
  const corpus = active.map((l) => [l.title, l.description, l.locationText].filter(Boolean).join("\n")).join("\n");
  const slots = slotConstraint(corpus);
  const dates = datePhrases(corpus);
  const locs = [...new Set(active.map((l) => String(l.locationText || "").trim()).filter(Boolean))];
  const warnings = [];
  const bundles = [];
  const items = [];
  for (const l of active.slice(0, MAX_ITEMS)) {
    const key = String(l.id || "").trim();
    if (!/^[A-Za-z0-9._:~-]{1,120}$/.test(key)) { warnings.push("skipped listing with a bad id"); continue; }
    const fields = itemFieldsFromListing(l);
    if (!fields.name) { warnings.push(`${key}: missing name`); continue; }
    if (fields.warning) warnings.push(`${key}: ${fields.warning}`);
    const note = String(l.description || "").trim();
    const lines = bundleLines(note);
    if (lines.length >= 2) bundles.push({ externalKey: key, lines, reason: "Description lists several priced items. Not split." });
    if (lines.length >= 2 && (!l.photos || l.photos.length <= 1)) warnings.push(`${key}: possible collage`);
    if (!l.photos?.length) warnings.push(`${key}: no photo`);
    if (fields.name.length > 60) warnings.push(`${key}: long name`);
    const item = { externalKey: key, name: fields.name, price: fields.price };
    if (note) item.note = note;
    items.push(item);
  }
  if (!items.length) throw new Error("No items to convert");
  const review = {
    warnings,
    facebookUrl: { from: picked.from, listingId, url: facebookUrl },
  };
  if (slots) review.slots = slots;
  if (dates.length) review.pickupTo = { raw: dates, reason: "Pickup window and move-out are one field (pickupTo). Not inferred." };
  if (locs.length) {
    review.address = {
      raw: locs.join(" / "),
      storedAs: locs.map(wardStored),
      reason: "Not sent. 市/町/村 are stored as written; a bare ward still gains 区. Copy storedAs into settings.address when it is the pickup area.",
    };
  }
  if (bundles.length) review.bundles = bundles;
  const skipped = grab.listings.filter((l) => l && (l.status === "sold" || l.status === "pending")).map((l) => ({ id: l.id, status: l.status }));
  if (skipped.length) review.skipped = skipped;
  if (grab.stopped) review.stopped = grab.stopped;
  const settings = { facebookUrl };
  if (slots?.slots?.length) settings.slots = slots.slots;
  return {
    externalSource: { source: SOURCE, sellerId: sourceSellerId(grab) },
    settings,
    items,
    review,
  };
}

/** Blocks a build when slots could not be generated, or a bundle is still unsplit. Address does not block. */
export function buildBlocked(shop) {
  const blocks = [];
  const review = shop?.review || {};
  const settings = shop?.settings || {};
  const facebookUrl = String(settings.facebookUrl || "").trim();
  if (!/\/marketplace\/item\/\d+\/?$/.test(facebookUrl)) blocks.push("facebookUrl");
  if (review.slots && !review.slots.slots && !(Array.isArray(settings.slots) && settings.slots.length)) blocks.push("slots");
  const bundles = Array.isArray(review.bundles) ? review.bundles : [];
  if (bundles.length && review.bundlesDone !== true && bundles.some((b) => b.done !== true)) blocks.push("bundles");
  return blocks;
}

export function expectedPhotos(shop) {
  return (shop?.items || []).reduce((n, it) => n + (Array.isArray(it.photoFiles) ? it.photoFiles.length : 0), 0);
}
export function photoCount(state) {
  return (state?.items || []).reduce((n, it) => n + (Array.isArray(it.photos) ? it.photos.length : 0), 0);
}

/** The four API checks. English is separate: it comes from the screenshot page, not the API. */
export function verifyShop(state, shop) {
  const facebookUrl = String(state?.settings?.facebookUrl || "").trim();
  const want = String(shop?.settings?.facebookUrl || "").trim();
  const checks = {
    unclaimed: state?.claimed === false,
    unpublished: state?.published === false,
    facebookUrl: !!facebookUrl && facebookUrl === want,
    photoCount: photoCount(state) === expectedPhotos(shop),
  };
  return { ok: Object.values(checks).every(Boolean), checks };
}

/** Why this existing shop must not be written. Empty string means it is ours or new. */
export function otherAgent(row, agentId) {
  if (!row) return "";
  if (row.claimed) return "claimed";
  const lease = row.lease?.agentId || "";
  if (lease && lease !== agentId) return `lease:${lease}`;
  const last = row.lastAgentId || "";
  if (last && last !== agentId) return `agent:${last}`;
  return "";
}

export function englishOk(signals) {
  return !!signals
    && signals.saved === "en"
    && signals.lang === "en"
    && signals.help === true
    && signals.cta === true
    && signals.splash === false;
}

export function sendRow(shop, state, shot) {
  const verified = verifyShop(state, shop);
  const english = englishOk(shot?.signals);
  const checks = { ...verified.checks, english };
  const ready = verified.ok && english;
  const url = state?.url || "";
  return {
    ready,
    sellerId: shop.externalSource?.sellerId || "",
    threadUrl: shop.settings?.facebookUrl || "",
    shopId: state?.id || "",
    shopUrl: url,
    editorUrl: state?.editorUrl || "",
    screenshot: ready ? (shot?.path || "") : "",
    checks,
    warnings: shop.review?.warnings || [],
  };
}

export async function pool(n, items, fn) {
  const out = new Array(items.length);
  let next = 0;
  const size = Math.max(1, Math.min(Math.max(1, n), Math.max(1, items.length)));
  if (!items.length) return out;
  await Promise.all(Array.from({ length: size }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  }));
  return out;
}
