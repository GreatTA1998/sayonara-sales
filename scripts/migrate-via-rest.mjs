#!/usr/bin/env node
/** One-shot migrate using Firebase CLI user token (no SA key).
 *  node scripts/migrate-via-rest.mjs [--shop=elton] [--from=path|url]
 */
import { readFileSync } from "fs";
import { readFile as readFileAsync } from "fs/promises";
import { homedir } from "os";
import { join } from "path";

const PROJECT = process.env.FIREBASE_PROJECT_ID || "sayonara-sales";
const arg = (n, d = "") => { const h = process.argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d; };
const shop = (arg("shop", "elton") || "elton").toLowerCase();
const from = arg("from");

function token() {
  const c = JSON.parse(readFileSync(join(homedir(), ".config/configstore/firebase-tools.json"), "utf8"));
  if (!c.tokens?.access_token) throw new Error("firebase login required");
  return c.tokens.access_token;
}

async function load() {
  if (from) {
    if (/^https?:/i.test(from)) {
      const r = await fetch(from, { cache: "no-store" });
      if (!r.ok) throw new Error(String(r.status));
      return r.json();
    }
    return JSON.parse(await readFileAsync(from, "utf8"));
  }
  const r = await fetch(`https://sayonara.tokyo/api/admin?shop=${encodeURIComponent(shop)}`, { cache: "no-store" });
  if (!r.ok) throw new Error(`admin ${r.status}`);
  return r.json();
}

const val = (v) => {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === "string") return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(val) } };
  if (typeof v === "object") {
    const fields = {};
    for (const [k, x] of Object.entries(v)) fields[k] = val(x);
    return { mapValue: { fields } };
  }
  return { stringValue: String(v) };
};

const doc = (name, data) => ({
  name,
  fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, val(v)])),
});

const raw = await load();
const base = `projects/${PROJECT}/databases/(default)/documents`;
const writes = [];
writes.push({
  update: doc(`${base}/shops/${shop}`, {
    address: raw.address || "",
    bio: raw.bio || "",
    jimotyUrl: raw.jimotyUrl || "",
    youtubeUrl: raw.youtubeUrl || "",
    lineInviteUrl: raw.lineInviteUrl || "",
    phone: raw.phone || "",
    slots: raw.slots?.length ? raw.slots : [],
    pickupFrom: raw.pickupFrom || "",
    pickupTo: raw.pickupTo || "",
    moveOut: raw.moveOut || "",
    published: !!raw.published,
    updatedAt: new Date().toISOString(),
  }),
});
const items = raw.items || [];
items.forEach((it, pos) => {
  writes.push({
    update: doc(`${base}/shops/${shop}/items/${it.id}`, {
      name: it.name || "",
      price: it.price == null || it.price === "" ? null : Number(it.price),
      note: it.note || null,
      claimId: it.claimId || null,
      photos: it.photos || [],
      paused: !!it.paused,
      pos,
    }),
  });
});
const claims = raw.claims || [];
for (const c of claims) {
  writes.push({
    update: doc(`${base}/shops/${shop}/claims/${c.id}`, {
      code: c.code || "",
      day: c.day || "",
      slot: c.slot || null,
      itemIds: c.itemIds || [],
      contact: c.contact || null,
      contactMethod: c.contactMethod || null,
      status: c.status,
      createdAt: c.createdAt || new Date().toISOString(),
    }),
  });
}

// Commit in chunks of 400
const tok = token();
for (let i = 0; i < writes.length; i += 400) {
  const chunk = writes.slice(i, i + 400);
  const res = await fetch(`https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents:commit`, {
    method: "POST",
    headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
    body: JSON.stringify({ writes: chunk }),
  });
  if (!res.ok) throw new Error(await res.text());
}
console.log(JSON.stringify({ ok: true, shop, items: items.length, claims: claims.length, writes: writes.length, project: PROJECT }));
