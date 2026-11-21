#!/usr/bin/env node
/** Prove concurrent item updates don't clobber under granular persist. */
const j = (v) => JSON.stringify(v);

function mem(seed) {
  const m = new Map(Object.entries(seed).map(([id, r]) => [id, { ...r }]));
  return {
    snap: () => Object.fromEntries([...m.entries()].map(([id, r]) => [id, { ...r }])),
    set: async (id, row) => { m.set(id, { ...row }); },
  };
}

async function persist(db, before, after) {
  const b = new Map(before.items.map((it, i) => [it.id, { name: it.name, price: it.price, pos: i }]));
  for (let i = 0; i < after.items.length; i++) {
    const it = after.items[i];
    const row = { name: it.name, price: it.price, pos: i };
    if (j(b.get(it.id)) !== j(row)) await db.set(it.id, row);
  }
}

// Naive whole-doc overwrite loses the other edit
{
  let doc = { items: [{ id: "a", name: "A0", price: 0 }, { id: "b", name: "B0", price: 0 }] };
  const snap = structuredClone(doc);
  const w1 = structuredClone(snap); w1.items[0].name = "A1";
  const w2 = structuredClone(snap); w2.items[1].name = "B1";
  doc = w1; doc = w2;
  if (doc.items[0].name !== "A0") throw new Error("naive setup");
  console.log("naive whole-doc overwrite: LOST write ✓");
}

// Granular: both kept (Firestore-style per-doc writes)
{
  const seed = { a: { name: "A0", price: 0, pos: 0 }, b: { name: "B0", price: 0, pos: 1 } };
  const db = mem(seed);
  const before = { items: Object.entries(seed).map(([id, r]) => ({ id, name: r.name, price: r.price })) };
  const w1 = structuredClone(before); w1.items[0].name = "A1";
  const w2 = structuredClone(before); w2.items[1].name = "B1";
  await Promise.all([persist(db, before, w1), persist(db, before, w2)]);
  const final = db.snap();
  if (final.a.name !== "A1" || final.b.name !== "B1") throw new Error(j(final));
  console.log("granular concurrent updates: BOTH kept ✓", { a: final.a.name, b: final.b.name });
}

if (process.argv.includes("--live")) {
  // Uses Firebase CLI user token when no SA; else FIREBASE_* SA JWT.
  const { readFileSync } = await import("fs");
  const { homedir } = await import("os");
  const { join } = await import("path");
  const { createSign } = await import("crypto");
  const projectId = process.env.FIREBASE_PROJECT_ID || "sayonara-sales";
  let tok = "";
  if (process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
    const b64url = (b) => Buffer.from(b).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
    const now = Math.floor(Date.now() / 1000);
    const email = process.env.FIREBASE_CLIENT_EMAIL;
    const key = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n");
    const unsigned = `${b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64url(JSON.stringify({
      iss: email, sub: email, aud: "https://oauth2.googleapis.com/token",
      iat: now, exp: now + 3600, scope: "https://www.googleapis.com/auth/datastore",
    }))}`;
    const jwt = `${unsigned}.${b64url(createSign("RSA-SHA256").update(unsigned).sign(key))}`;
    const tr = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
    });
    if (!tr.ok) throw new Error(await tr.text());
    tok = (await tr.json()).access_token;
  } else {
    const c = JSON.parse(readFileSync(join(homedir(), ".config/configstore/firebase-tools.json"), "utf8"));
    tok = c.tokens?.access_token;
    if (!tok) throw new Error("need FIREBASE_* or firebase login");
  }
  const shop = `r${Date.now().toString(36).slice(-5)}`;
  const base = `projects/${projectId}/databases/(default)/documents`;
  const val = (v) => (typeof v === "string" ? { stringValue: v } : typeof v === "boolean" ? { booleanValue: v } : { integerValue: String(v) });
  const commit = async (writes) => {
    const res = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:commit`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
      body: JSON.stringify({ writes }),
    });
    if (!res.ok) throw new Error(await res.text());
  };
  await commit([
    { update: { name: `${base}/shops/${shop}`, fields: { address: val("t"), published: val(false) } } },
    { update: { name: `${base}/shops/${shop}/items/a`, fields: { name: val("A0"), price: val(0), pos: val(0) } } },
    { update: { name: `${base}/shops/${shop}/items/b`, fields: { name: val("B0"), price: val(0), pos: val(1) } } },
  ]);
  await Promise.all([
    fetch(`https://firestore.googleapis.com/v1/${base}/shops/${shop}/items/a?updateMask.fieldPaths=name`, {
      method: "PATCH", headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
      body: JSON.stringify({ fields: { name: val("A1") } }),
    }),
    fetch(`https://firestore.googleapis.com/v1/${base}/shops/${shop}/items/b?updateMask.fieldPaths=name`, {
      method: "PATCH", headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
      body: JSON.stringify({ fields: { name: val("B1") } }),
    }),
  ]);
  const [ra, rb] = await Promise.all([
    fetch(`https://firestore.googleapis.com/v1/${base}/shops/${shop}/items/a`, { headers: { Authorization: `Bearer ${tok}` } }),
    fetch(`https://firestore.googleapis.com/v1/${base}/shops/${shop}/items/b`, { headers: { Authorization: `Bearer ${tok}` } }),
  ]);
  const a = await ra.json(), b = await rb.json();
  const map = { a: a.fields.name.stringValue, b: b.fields.name.stringValue };
  await commit([
    { delete: `${base}/shops/${shop}/items/a` },
    { delete: `${base}/shops/${shop}/items/b` },
    { delete: `${base}/shops/${shop}` },
  ]);
  if (map.a !== "A1" || map.b !== "B1") throw new Error(j(map));
  console.log("live Firestore: BOTH kept ✓", map);
}
console.log("ok");
