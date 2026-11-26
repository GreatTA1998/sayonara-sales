/**
 * Shop builder contract against the Firestore emulator and the route handlers.
 * Run via npm run test:shop-builder (firestore + auth emulators).
 */
import { spawn } from "node:child_process";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from "firebase/firestore";

process.env.SHOP_BUILDER_API_TOKEN = "test-token";
process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = "demo-sayonara";
process.env.NEXT_PUBLIC_FIREBASE_API_KEY = "demo";
process.env.NEXT_PUBLIC_FIREBASE_APP_ID = "1:1:web:demo";
process.env.SHOP_BUILDER_PHOTO_STUB = "1";
process.env.NEXT_PUBLIC_SITE_URL = "https://sayonara.tokyo";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

async function main() {
const hostEnv = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";
const [host, portStr] = hostEnv.split(":");
const rules = readFileSync(new URL("../firestore.rules", import.meta.url), "utf8");
const testEnv: RulesTestEnvironment = await initializeTestEnvironment({
  projectId: "demo-sayonara",
  firestore: { rules, host, port: Number(portStr) },
});
await testEnv.clearFirestore();

const shopsRoute = await import("../app/api/shop-builder/shops/route");
const oneRoute = await import("../app/api/shop-builder/shops/[shopId]/route");
const leaseRoute = await import("../app/api/shop-builder/shops/[shopId]/lease/route");
const itemsRoute = await import("../app/api/shop-builder/shops/[shopId]/items/route");
const itemRoute = await import("../app/api/shop-builder/shops/[shopId]/items/[itemKey]/route");
const photoRoute = await import("../app/api/shop-builder/shops/[shopId]/photos/route");
const builder = await import("../lib/shop-builder");

const fails: string[] = [];
const check = (name: string, ok: boolean, detail?: unknown) => {
  console.log(`${ok ? "ok" : "FAIL"} ${name}`);
  if (!ok) {
    fails.push(name);
    if (detail !== undefined) console.log(JSON.stringify(detail).slice(0, 1500));
  }
};

async function dispatch(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts[0] !== "api" || parts[1] !== "shop-builder" || parts[2] !== "shops") {
    return new Response("no", { status: 404 });
  }
  if (parts.length === 3) {
    if (req.method === "GET") return shopsRoute.GET(req);
    if (req.method === "POST") return shopsRoute.POST(req);
  }
  const shopId = decodeURIComponent(parts[3] || "");
  const params = Promise.resolve({ shopId });
  if (parts.length === 4 && req.method === "GET") return oneRoute.GET(req, { params });
  if (parts[4] === "lease" && req.method === "POST") return leaseRoute.POST(req, { params });
  if (parts[4] === "lease" && req.method === "DELETE") return leaseRoute.DELETE(req, { params });
  if (parts[4] === "items" && parts.length === 5 && req.method === "POST") return itemsRoute.POST(req, { params });
  if (parts[4] === "items" && parts.length === 6) {
    const itemKey = decodeURIComponent(parts[5]);
    const itemParams = Promise.resolve({ shopId, itemKey });
    if (req.method === "PUT") return itemRoute.PUT(req, { params: itemParams });
    if (req.method === "DELETE") return itemRoute.DELETE(req, { params: itemParams });
  }
  if (parts[4] === "photos" && req.method === "POST") return photoRoute.POST(req, { params });
  return new Response("no", { status: 404 });
}

async function call(method: string, pathname: string, opts: {
  token?: string | null; agent?: string; ifMatch?: number | string; body?: unknown; form?: FormData;
} = {}) {
  const headers = new Headers();
  if (opts.token !== null) headers.set("authorization", `Bearer ${opts.token ?? "test-token"}`);
  if (opts.agent) headers.set("x-agent-id", opts.agent);
  if (opts.ifMatch != null) headers.set("if-match", typeof opts.ifMatch === "number" ? `"${opts.ifMatch}"` : String(opts.ifMatch));
  let body: BodyInit | undefined;
  if (opts.form) body = opts.form;
  else if (opts.body !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(opts.body);
  }
  const res = await dispatch(new Request(`http://local${pathname}`, { method, headers, body }));
  const text = await res.text();
  let json: Record<string, unknown> | null = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { error: text }; }
  return { status: res.status, json: json as Record<string, any>, etag: res.headers.get("etag") };
}

const src = (sellerId: string, extra: Record<string, unknown> = {}) => ({
  externalSource: { source: "facebook_marketplace", sellerId },
  ...extra,
});

async function rawShop(id: string) {
  const db = testEnv.unauthenticatedContext().firestore();
  const snap = await getDoc(doc(db, "shops", id));
  return snap.data();
}

{
  const no = await call("POST", "/api/shop-builder/shops", { token: "nope", agent: "a", body: src("nope") });
  check("bad token is 401", no.status === 401, no.json);
  const prev = process.env.SHOP_BUILDER_API_TOKEN;
  delete process.env.SHOP_BUILDER_API_TOKEN;
  const off = await call("POST", "/api/shop-builder/shops", { agent: "a", body: src("off") });
  process.env.SHOP_BUILDER_API_TOKEN = prev;
  check("unset token is 404", off.status === 404, off.json);
}

{
  const created = await call("POST", "/api/shop-builder/shops", {
    agent: "agent-a",
    body: src("seller-a", {
      settings: { address: "目黒", bio: "駅前で引き渡し" },
      items: [{ externalKey: "chair", name: "椅子", price: 1500, note: "傷", photos: ["https://example.com/c.jpg"] }],
    }),
  });
  check("upsert 200", created.status === 200, created.json);
  const id = String(created.json?.id || "");
  check("shop url", created.json?.url === `https://sayonara.tokyo/s/${id}` && created.json?.editorUrl === `https://sayonara.tokyo/s/${id}/admin`, created.json);
  check("etag is rev", created.etag === `"${created.json?.rev}"`, created.etag);
  const data = id ? await rawShop(id) : undefined;
  check("unpublished and no owner", !!data && data.published === false && data.ownerUid == null && !("ownerLineUid" in data) && data.lastAgentId === "agent-a", data);
  check("photo rehosted", String(created.json?.items?.[0]?.photos?.[0] || "").includes(".blob.vercel-storage.com"), created.json?.items);
  check("address ward", created.json?.settings?.address === "目黒区", created.json?.settings);

  const again = await call("POST", "/api/shop-builder/shops", {
    agent: "agent-a",
    body: src("seller-a", { items: [{ externalKey: "chair", name: "椅子", price: 1800 }] }),
  });
  check("second upsert same id", again.status === 200 && again.json?.id === id && again.json?.items?.[0]?.price === 1800, again.json);
  const db = testEnv.unauthenticatedContext().firestore();
  const found = await getDocs(query(collection(db, "shops"), where("externalKey", "==", "facebook_marketplace\nseller-a")));
  check("one shop for the seller", found.size === 1, found.size);
}

{
  const city = await call("POST", "/api/shop-builder/shops", {
    agent: "agent-a",
    body: src("seller-kawaguchi", { settings: { address: "川口市" } }),
  });
  check("city stored as-is", city.status === 200 && city.json?.settings?.address === "川口市", city.json?.settings);
  const town = await call("POST", "/api/shop-builder/shops", {
    agent: "agent-a",
    body: src("seller-town", { settings: { address: "川口町" } }),
  });
  check("town stored as-is", town.status === 200 && town.json?.settings?.address === "川口町", town.json?.settings);
  const village = await call("POST", "/api/shop-builder/shops", {
    agent: "agent-a",
    body: src("seller-village", { settings: { address: "田村" } }),
  });
  check("village stored as-is", village.status === 200 && village.json?.settings?.address === "田村", village.json?.settings);
  const ward = await call("POST", "/api/shop-builder/shops", {
    agent: "agent-a",
    body: src("seller-meguro-bare", { settings: { address: "目黒" } }),
  });
  check("bare ward still gains 区", ward.status === 200 && ward.json?.settings?.address === "目黒区", ward.json?.settings);
}

{
  const body = (agent: string, bio: string, lease = false) => src("seller-parallel", {
    lease, settings: { bio }, items: [{ externalKey: "lamp", name: "ランプ", price: 100 }],
  });
  const [r1, r2] = await Promise.all([
    call("POST", "/api/shop-builder/shops", { agent: "agent-a", body: body("a", "from-a") }),
    call("POST", "/api/shop-builder/shops", { agent: "agent-b", body: body("b", "from-b") }),
  ]);
  check("parallel upsert both ok", r1.status === 200 && r2.status === 200, { r1: r1.json, r2: r2.json });
  check("parallel upsert one id", r1.json?.id && r1.json.id === r2.json?.id, { a: r1.json?.id, b: r2.json?.id });
  const db = testEnv.unauthenticatedContext().firestore();
  const found = await getDocs(query(collection(db, "shops"), where("externalKey", "==", "facebook_marketplace\nseller-parallel")));
  check("parallel upsert one document", found.size === 1 && found.docs[0].data().published === false, found.size);
}

{
  const send = (agent: string, bio: string) => call("POST", "/api/shop-builder/shops", {
    agent,
    body: src("seller-lease", { lease: true, settings: { bio } }),
  });
  const [r1, r2] = await Promise.all([send("holder", "from-holder"), send("other", "from-other")]);
  const rows = [r1, r2];
  const ok = rows.filter((r) => r.status === 200);
  const locked = rows.filter((r) => r.status === 423);
  check("lease race is one writer and one 423", ok.length === 1 && locked.length === 1, rows.map((r) => ({ status: r.status, json: r.json })));
  if (ok[0] && locked[0]) {
    const data = await rawShop(String(ok[0].json.id));
    check("loser did not clobber", data?.bio === ok[0].json.settings.bio && data?.bio !== (ok[0].json.settings.bio === "from-holder" ? "from-other" : "from-holder"), data);
    check("423 names the holder", locked[0].json?.code === "lease_held" && locked[0].json?.lease?.agentId === ok[0].json.lastAgentId, locked[0].json);
  }
}

{
  const created = await call("POST", "/api/shop-builder/shops", {
    agent: "agent-a",
    body: src("seller-rev", { items: [{ externalKey: "desk", name: "机", price: 10 }] }),
  });
  const id = String(created.json?.id || "");
  const rev = Number(created.json?.rev);
  const stale = await call("PUT", `/api/shop-builder/shops/${id}/items/desk`, {
    agent: "agent-a", ifMatch: rev + 9, body: { price: 1 },
  });
  check("stale If-Match is 412", stale.status === 412 && stale.json?.rev === rev, stale.json);
  const missing = await call("PUT", `/api/shop-builder/shops/${id}/items/desk`, {
    agent: "agent-a", body: { price: 2 },
  });
  check("missing If-Match is 428", missing.status === 428, missing.json);
  const [p1, p2] = await Promise.all([
    call("PUT", `/api/shop-builder/shops/${id}/items/desk`, { agent: "agent-a", ifMatch: rev, body: { price: 3 } }),
    call("PUT", `/api/shop-builder/shops/${id}/items/desk`, { agent: "agent-a", ifMatch: rev, body: { price: 4 } }),
  ]);
  const wrote = [p1, p2].filter((r) => r.status === 200);
  const lost = [p1, p2].filter((r) => r.status === 412);
  check("item race is 200 and 412", wrote.length === 1 && lost.length === 1, [p1.status, p2.status]);
  const fresh = await call("GET", `/api/shop-builder/shops/${id}`);
  check("winner price stuck", fresh.json?.items?.[0]?.price === wrote[0]?.json?.items?.[0]?.price, fresh.json?.items);
}

{
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "shops", "33333"), {
      address: "渋谷区", published: false, ownerUid: "owner-1", rev: 4,
      externalKey: "facebook_marketplace\nseller-claimed",
      source: "facebook_marketplace", sellerId: "seller-claimed",
    });
    await setDoc(doc(db, "shopSources", builder.sourceDocId("facebook_marketplace", "seller-claimed")), {
      shopId: "33333", source: "facebook_marketplace", sellerId: "seller-claimed",
    });
  });
  const res = await call("POST", "/api/shop-builder/shops", {
    agent: "agent-a",
    body: src("seller-claimed", { settings: { address: "新宿" } }),
  });
  check("claimed shop is 409", res.status === 409 && res.json?.code === "claimed" && res.json?.url === "https://sayonara.tokyo/s/33333", res.json);
  const data = await rawShop("33333");
  check("claimed shop unchanged", data?.address === "渋谷区" && data?.ownerUid === "owner-1" && data?.rev === 4 && data?.published === false, data);
}

{
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "shops", "22222"), { address: "世田谷区", published: false, rev: 1 });
  });
  const first = await call("POST", "/api/shop-builder/shops", {
    agent: "agent-a",
    body: src("seller-reuse", { id: "22222", settings: { address: "目黒" } }),
  });
  check("reuse unclaimed id", first.status === 200 && first.json?.id === "22222" && first.json?.settings?.address === "目黒区", first.json);
  const second = await call("POST", "/api/shop-builder/shops", { agent: "agent-a", body: src("seller-reuse") });
  check("later upsert finds that id", second.status === 200 && second.json?.id === "22222", second.json);
}

{
  const db = testEnv.unauthenticatedContext().firestore();
  const before = (await getDocs(collection(db, "shops"))).size;
  const res = await call("POST", "/api/shop-builder/shops?dryRun=true", {
    agent: "agent-a",
    body: src("seller-dry", { settings: { address: "品川" }, items: [{ externalKey: "box", name: "箱", price: 0 }] }),
  });
  const after = (await getDocs(collection(db, "shops"))).size;
  check("dry-run does not write", res.status === 200 && res.json?.dryRun === true && res.json?.id == null && before === after, res.json);
}

{
  const bad = await call("POST", "/api/shop-builder/shops", {
    agent: "agent-a",
    body: { ...src("seller-unsafe"), ownerUid: "nope", published: true },
  });
  check("owner and published rejected", bad.status === 400, bad.json);
  const httpPhoto = await call("POST", "/api/shop-builder/shops", {
    agent: "agent-a",
    body: src("seller-http", { items: [{ externalKey: "x", name: "x", photos: ["http://example.com/a.jpg"] }] }),
  });
  check("http photo rejected", httpPhoto.status === 400, httpPhoto.json);
}

{
  const created = await call("POST", "/api/shop-builder/shops", {
    agent: "agent-a",
    body: src("seller-keep", { items: [{ externalKey: "keep-me", name: "残す" }, { externalKey: "drop-me", name: "消す" }] }),
  });
  const id = String(created.json?.id || "");
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "shops", id, "items", "ihand"), { name: "手入力", price: 5, pos: 9 });
    const external = created.json.items.find((it: { externalKey: string }) => it.externalKey === "keep-me");
    await updateDoc(doc(db, "shops", id, "items", external.id), { claimId: "claim-1" });
  });
  const next = await call("POST", "/api/shop-builder/shops", {
    agent: "agent-a",
    body: src("seller-keep", { items: [{ externalKey: "new-one", name: "新しい" }] }),
  });
  const keys = (next.json?.items || []).map((it: { externalKey: string | null; name: string }) => it.externalKey || it.name);
  check("editor item and claimed item stay", next.status === 200 && keys.includes("keep-me") && keys.includes("new-one") && keys.includes("手入力") && !keys.includes("drop-me"), next.json?.items);
  check("kept lists the claim", (next.json?.kept || []).includes("keep-me"), next.json?.kept);
}

{
  const free = await call("POST", "/api/shop-builder/shops", { agent: "agent-a", body: src("seller-free", { settings: { bio: "free" } }) });
  const held = await call("POST", "/api/shop-builder/shops", { agent: "agent-a", body: src("seller-held", { lease: true, settings: { bio: "held" } }) });
  check("seed list shops", free.status === 200 && held.status === 200, { free: free.status, held: held.status });
  const open = await call("GET", "/api/shop-builder/shops?source=facebook_marketplace&sellerId=seller-free&lease=free");
  const busy = await call("GET", "/api/shop-builder/shops?source=facebook_marketplace&sellerId=seller-held&lease=held");
  const busyFree = await call("GET", "/api/shop-builder/shops?source=facebook_marketplace&sellerId=seller-held&lease=free");
  check("list free shop", open.status === 200 && open.json?.shops?.length === 1 && open.json.shops[0].lease == null, open.json);
  check("list held shop", busy.status === 200 && busy.json?.shops?.[0]?.lease?.agentId === "agent-a", busy.json);
  check("held shop is not free", busyFree.json?.shops?.length === 0, busyFree.json);
  const released = await call("DELETE", `/api/shop-builder/shops/${held.json.id}/lease`, {
    agent: "agent-a", ifMatch: held.json.rev,
  });
  check("release lease", released.status === 200 && released.json?.lease == null, released.json);
}

{
  const created = await call("POST", "/api/shop-builder/shops", { agent: "agent-a", body: src("seller-batch") });
  const rev = created.json?.rev;
  const tooMany = await call("POST", `/api/shop-builder/shops/${created.json.id}/items`, {
    agent: "agent-a",
    ifMatch: rev,
    body: { ops: Array.from({ length: 41 }, (_, i) => ({ op: "upsert", externalKey: `k${i}`, name: "x" })) },
  });
  check("batch over 40 is 400", tooMany.status === 400, tooMany.json);
  const after = await call("GET", `/api/shop-builder/shops/${created.json.id}`);
  check("rejected batch does not bump rev", after.json?.rev === rev, after.json?.rev);
  const fd = new FormData();
  fd.append("file", new Blob([PNG], { type: "image/png" }), "a.png");
  const preview = await call("POST", `/api/shop-builder/shops/${created.json.id}/photos?dryRun=true`, {
    agent: "agent-a", form: fd,
  });
  check("photo dry-run stores nothing", preview.status === 200 && preview.json?.dryRun === true && preview.json?.bytesOut > 0, preview.json);
}

{
  const dir = mkdtempSync(path.join(tmpdir(), "shop-builder-"));
  writeFileSync(path.join(dir, "chair.png"), PNG);
  writeFileSync(path.join(dir, "seller.json"), JSON.stringify({
    agentId: "cli-agent",
    externalSource: { source: "facebook_marketplace", sellerId: "seller-cli" },
    settings: { address: "目黒", bio: "cli" },
    items: [{ externalKey: "chair", name: "椅子", price: 900, photoFiles: ["./chair.png"] }],
  }));
  const server = createServer((req, res) => { void onReq(req, res); });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const port = (server.address() as { port: number }).port;
  async function onReq(req: IncomingMessage, res: ServerResponse) {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const body = Buffer.concat(chunks);
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v == null || ["host", "content-length", "transfer-encoding", "connection"].includes(k)) continue;
      headers.set(k, Array.isArray(v) ? v.join(", ") : v);
    }
    const response = await dispatch(new Request(`http://127.0.0.1:${port}${req.url}`, {
      method: req.method,
      headers,
      body: body.length ? body : undefined,
    }));
    res.statusCode = response.status;
    response.headers.forEach((value, key) => res.setHeader(key, value));
    res.end(Buffer.from(await response.arrayBuffer()));
  }
  const run = () => new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
    const child = spawn(process.execPath, [path.resolve("scripts/shop-builder.mjs"), path.join(dir, "seller.json")], {
      env: {
        ...process.env,
        SHOP_BUILDER_API_TOKEN: "test-token",
        SHOP_BUILDER_API_BASE: `http://127.0.0.1:${port}`,
        SHOP_BUILDER_AGENT_ID: "cli-agent",
      },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => { stdout += d; });
    child.stderr.on("data", (d) => { stderr += d; });
    child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
  const first = await run();
  const lines = first.stdout.trim().split("\n");
  check("cli prints shop and editor", first.code === 0 && /^https:\/\/sayonara\.tokyo\/s\/\d{5}$/.test(lines[0]) && lines[1] === `${lines[0]}/admin`, { first });
  const second = await run();
  check("cli rerun same url", second.code === 0 && second.stdout.trim().split("\n")[0] === lines[0], second);
  const id = lines[0]?.split("/").pop() || "";
  const data = id ? await rawShop(id) : undefined;
  check("cli shop unpublished", !!data && data.published === false && data.ownerUid == null && data.leaseAgentId == null, data);
  server.close();
}

await testEnv.cleanup();
if (fails.length) {
  console.error(`\n${fails.length} failed`);
  process.exit(1);
}
console.log("\nall passed");
process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
