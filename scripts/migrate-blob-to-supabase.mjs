#!/usr/bin/env node
/** Idempotent Blob/JSON → Supabase. Needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 *  node scripts/migrate-blob-to-supabase.mjs [--shop=elton] [--from=path|url]
 */
import { get } from "@vercel/blob";
import { readFile } from "fs/promises";

const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error("Need SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY"); process.exit(1); }

const arg = (n, d = "") => { const h = process.argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d; };
const shop = (arg("shop", "elton") || "elton").toLowerCase();
const from = arg("from");
const blobKey = shop === "elton" ? "sayonara-store.json" : `sayonara-store-${shop}.json`;

async function sb(path, init = {}) {
  const res = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal", ...(init.headers || {}),
    },
  });
  if (!res.ok) throw new Error(await res.text());
}

async function load() {
  if (from) {
    if (/^https?:/i.test(from)) { const r = await fetch(from, { cache: "no-store" }); if (!r.ok) throw new Error(String(r.status)); return r.json(); }
    return JSON.parse(await readFile(from, "utf8"));
  }
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const res = await get(blobKey, { access: "public" });
    if (res) return JSON.parse(await new Response(res.stream).text());
  }
  const r = await fetch(`https://sayonara.tokyo/api/admin?shop=${encodeURIComponent(shop)}`, { cache: "no-store" });
  if (!r.ok) throw new Error(`admin ${r.status}`);
  return r.json();
}

const raw = await load();
await sb("shops", { method: "POST", body: JSON.stringify({
  id: shop, address: raw.address || "", bio: raw.bio || "", jimoty_url: raw.jimotyUrl || "",
  youtube_url: raw.youtubeUrl || "", line_invite_url: raw.lineInviteUrl || "", phone: raw.phone || "",
  slots: raw.slots?.length ? raw.slots : null, pickup_from: raw.pickupFrom || null,
  pickup_to: raw.pickupTo || null, move_out: raw.moveOut || null, published: !!raw.published,
  updated_at: new Date().toISOString(),
}) });
const items = raw.items || [];
if (items.length) await sb("items", { method: "POST", body: JSON.stringify(items.map((it, pos) => ({
  id: it.id, shop_id: shop, name: it.name || "", price: it.price == null || it.price === "" ? null : Number(it.price),
  note: it.note || null, claim_id: it.claimId || null, photos: it.photos || [], paused: !!it.paused, pos,
}))) });
const claims = raw.claims || [];
if (claims.length) await sb("claims", { method: "POST", body: JSON.stringify(claims.map((c) => ({
  id: c.id, shop_id: shop, code: c.code || "", day: c.day || "", slot: c.slot || null,
  item_ids: c.itemIds || [], contact: c.contact || null, contact_method: c.contactMethod || null,
  status: c.status, created_at: c.createdAt || new Date().toISOString(),
}))) });
console.log(JSON.stringify({ ok: true, shop, items: items.length, claims: claims.length }));
