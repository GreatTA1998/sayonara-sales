#!/usr/bin/env node
/** Idempotent JSON → Firestore via service-account REST (same as lib/fb.ts).
 *  FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY
 *  node scripts/migrate-to-firestore.mjs [--shop=elton] [--from=path|url]
 */
import { createSign } from "crypto";
import { readFile } from "fs/promises";

const arg = (n, d = "") => { const h = process.argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d; };
const shop = (arg("shop", "elton") || "elton").toLowerCase();
const from = arg("from");

const projectId = process.env.FIREBASE_PROJECT_ID || "sayonara-sales";
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
if (!clientEmail || !privateKey) {
  console.error("Need FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY (or use migrate-via-rest.mjs with firebase login)");
  process.exit(1);
}

const b64url = (b) => Buffer.from(b).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
async function token() {
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64url(JSON.stringify({
    iss: clientEmail, sub: clientEmail, aud: "https://oauth2.googleapis.com/token",
    iat: now, exp: now + 3600, scope: "https://www.googleapis.com/auth/datastore",
  }))}`;
  const jwt = `${unsigned}.${b64url(createSign("RSA-SHA256").update(unsigned).sign(privateKey))}`;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()).access_token;
}

const val = (v) => {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === "string") return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(val) } };
  const fields = {};
  for (const [k, x] of Object.entries(v)) fields[k] = val(x);
  return { mapValue: { fields } };
};
const doc = (name, data) => ({ name, fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, val(v)])) });

async function load() {
  if (from) {
    if (/^https?:/i.test(from)) {
      const r = await fetch(from, { cache: "no-store" });
      if (!r.ok) throw new Error(String(r.status));
      return r.json();
    }
    return JSON.parse(await readFile(from, "utf8"));
  }
  const r = await fetch(`https://sayonara.tokyo/api/admin?shop=${encodeURIComponent(shop)}`, { cache: "no-store" });
  if (!r.ok) throw new Error(`admin ${r.status}`);
  return r.json();
}

const raw = await load();
const base = `projects/${projectId}/databases/(default)/documents`;
const writes = [];
writes.push({ update: doc(`${base}/shops/${shop}`, {
  address: raw.address || "", bio: raw.bio || "", jimotyUrl: raw.jimotyUrl || "",
  youtubeUrl: raw.youtubeUrl || "", lineInviteUrl: raw.lineInviteUrl || "", phone: raw.phone || "",
  slots: raw.slots?.length ? raw.slots : [], pickupFrom: raw.pickupFrom || "",
  pickupTo: raw.pickupTo || "", moveOut: raw.moveOut || "", published: !!raw.published,
  updatedAt: new Date().toISOString(),
}) });
const items = raw.items || [];
items.forEach((it, pos) => {
  writes.push({ update: doc(`${base}/shops/${shop}/items/${it.id}`, {
    name: it.name || "",
    price: it.price == null || it.price === "" ? null : Number(it.price),
    note: it.note || null, claimId: it.claimId || null,
    photos: it.photos || [], paused: !!it.paused, pos,
  }) });
});
const claims = raw.claims || [];
for (const c of claims) {
  writes.push({ update: doc(`${base}/shops/${shop}/claims/${c.id}`, {
    code: c.code || "", day: c.day || "", slot: c.slot || null,
    itemIds: c.itemIds || [], contact: c.contact || null, contactMethod: c.contactMethod || null,
    status: c.status, createdAt: c.createdAt || new Date().toISOString(),
  }) });
}
const tok = await token();
for (let i = 0; i < writes.length; i += 400) {
  const res = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:commit`, {
    method: "POST",
    headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
    body: JSON.stringify({ writes: writes.slice(i, i + 400) }),
  });
  if (!res.ok) throw new Error(await res.text());
}
console.log(JSON.stringify({ ok: true, shop, items: items.length, claims: claims.length, project: projectId }));
