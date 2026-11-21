#!/usr/bin/env node
/** Prove concurrent item updates don't clobber under granular persist. */
const j = (v) => JSON.stringify(v);
const row = (shop, it, pos) => ({
  id: it.id, shop_id: shop, name: it.name, price: it.price, note: it.note || null,
  claim_id: it.claimId || null, photos: it.photos || [], paused: !!it.paused, pos,
});

function mem(seed) {
  const m = new Map(seed.map((r) => [r.id, { ...r }]));
  return {
    snap: () => [...m.values()].map((r) => ({ ...r })),
    upsert: async (rows) => { for (const r of rows) m.set(r.id, { ...r }); },
  };
}

async function persist(db, shop, before, after) {
  const b = new Map(before.items.map((it, i) => [it.id, row(shop, it, i)]));
  const a = after.items.map((it, i) => row(shop, it, i));
  await db.upsert(a.filter((r) => j(b.get(r.id)) !== j(r)));
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

// Granular: both kept
{
  const shop = "race";
  const seed = [row(shop, { id: "a", name: "A0", price: 0 }, 0), row(shop, { id: "b", name: "B0", price: 0 }, 1)];
  const db = mem(seed);
  const before = { items: seed.map((r) => ({ id: r.id, name: r.name, price: r.price })) };
  const w1 = structuredClone(before); w1.items[0].name = "A1";
  const w2 = structuredClone(before); w2.items[1].name = "B1";
  await Promise.all([persist(db, shop, before, w1), persist(db, shop, before, w2)]);
  const final = Object.fromEntries(db.snap().map((r) => [r.id, r.name]));
  if (final.a !== "A1" || final.b !== "B1") throw new Error(j(final));
  console.log("granular concurrent updates: BOTH kept ✓", final);
}

if (process.argv.includes("--live")) {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("need SUPABASE_* for --live");
  const shop = `r${Date.now().toString(36).slice(-5)}`;
  const hdr = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=representation" };
  await fetch(`${url}/rest/v1/shops`, { method: "POST", headers: { ...hdr, Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ id: shop, address: "t" }) });
  const ids = [`${shop}-a`, `${shop}-b`];
  await fetch(`${url}/rest/v1/items`, {
    method: "POST", headers: { ...hdr, Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify([
      { id: ids[0], shop_id: shop, name: "A0", price: 0, photos: [], paused: false, pos: 0 },
      { id: ids[1], shop_id: shop, name: "B0", price: 0, photos: [], paused: false, pos: 1 },
    ]),
  });
  await Promise.all([
    fetch(`${url}/rest/v1/items?id=eq.${ids[0]}`, { method: "PATCH", headers: hdr, body: JSON.stringify({ name: "A1" }) }),
    fetch(`${url}/rest/v1/items?id=eq.${ids[1]}`, { method: "PATCH", headers: hdr, body: JSON.stringify({ name: "B1" }) }),
  ]);
  const res = await fetch(`${url}/rest/v1/items?shop_id=eq.${shop}&select=id,name`, { headers: hdr });
  const data = await res.json();
  await fetch(`${url}/rest/v1/shops?id=eq.${shop}`, { method: "DELETE", headers: hdr });
  const map = Object.fromEntries(data.map((r) => [r.id.endsWith("-a") ? "a" : "b", r.name]));
  if (map.a !== "A1" || map.b !== "B1") throw new Error(j(map));
  console.log("live Supabase: BOTH kept ✓", map);
}
console.log("ok");
