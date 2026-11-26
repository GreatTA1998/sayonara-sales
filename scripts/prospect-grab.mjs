#!/usr/bin/env node
/**
 * One pass over one seller's Marketplace listings.
 * CDP mode attaches to a Chrome the operator already logged in (does not launch Chrome,
 * type credentials, close that Chrome, or accept search URLs).
 * Saved mode reads Ctrl+S Webpage Complete .html / .mhtml when CDP misses lazy thumbs.
 *
 *   node scripts/prospect-grab.mjs --cdp http://127.0.0.1:9222 --out data/prospects/seller.json <profile-or-item-url>
 *   node scripts/prospect-grab.mjs --saved data/prospects/saved --out data/prospects/seller.json
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  MAX_ITEMS, assertGrabUrls, assertLocalCdp, canonicalFacebookUrl, isGraphqlUrl,
  itemIdFromUrl, outputWarning, paceMs, parseArgs, profileIdFromUrl, runGrab,
  runGrabSaved, savedPageHtml,
} from "./prospect.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const usage = [
  "usage:",
  "  node scripts/prospect-grab.mjs --cdp http://127.0.0.1:9222 --out data/prospects/seller.json <profile-or-item-url> [item-url...]",
  "  node scripts/prospect-grab.mjs --saved <dir-or-file> --out data/prospects/seller.json",
].join("\n");

const a = parseArgs(process.argv.slice(2));
if (a.flags.help || (!a._.length && !a.flags.saved)) {
  console.error(usage);
  process.exit(a.flags.help ? 0 : 1);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function savedFiles(root) {
  const abs = path.resolve(String(root));
  const st = fs.statSync(abs);
  if (!st.isDirectory()) return /\.(html?|mht(?:ml)?)$/i.test(abs) ? [abs] : [];
  return fs.readdirSync(abs).sort()
    .map((name) => path.join(abs, name))
    .filter((p) => fs.statSync(p).isFile() && /\.(html?|mht(?:ml)?)$/i.test(p));
}

async function fetchPhoto(url) {
  const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(20_000) });
  if (!res.ok) return null;
  const type = (res.headers.get("content-type") || "").toLowerCase();
  if (type && !type.startsWith("image/")) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  return buf.length >= 800 ? buf : null;
}

async function writeGrab(grab, out, download = fetchPhoto) {
  const dir = path.dirname(out);
  fs.mkdirSync(dir, { recursive: true });
  for (const listing of grab.listings) {
    if (listing.status !== "active") continue;
    for (let i = 0; i < listing.photos.length; i++) {
      let buf = null;
      try { buf = await download(listing.photos[i].url); }
      catch { buf = null; }
      if (!buf) continue;
      const rel = `photos/${listing.id}-${i}.jpg`;
      fs.mkdirSync(path.join(dir, "photos"), { recursive: true });
      fs.writeFileSync(path.join(dir, rel), buf);
      listing.photos[i].file = rel;
    }
  }
  fs.writeFileSync(out, `${JSON.stringify(grab, null, 2)}\n`);
  const bundles = grab.listings.filter((l) => l.bundleHint).length;
  console.log(`${out}  listings=${grab.listings.length}  bundles=${bundles}${grab.stopped ? `  stopped=${grab.stopped}` : ""}`);
}

async function connect(cdp) {
  let chromium;
  try { ({ chromium } = await import("playwright-core")); }
  catch {
    throw new Error("playwright-core is not installed. Run: npm install --save-dev playwright-core");
  }
  const browser = await chromium.connectOverCDP(cdp);
  const context = browser.contexts()[0];
  if (!context) throw new Error("No Chrome window on that port. Start the logged-in Chrome with --remote-debugging-port.");
  const page = await context.newPage();
  const graphql = [];
  const pending = [];
  page.on("response", (res) => {
    let u = "";
    try { u = res.url(); } catch { return; }
    if (!isGraphqlUrl(u)) return;
    pending.push(res.json().then((j) => { graphql.push(j); }).catch(() => {}));
  });
  async function drain() {
    await Promise.all(pending.splice(0, pending.length));
    return { url: page.url(), html: await page.content(), graphql: graphql.splice(0, graphql.length) };
  }
  async function settle() {
    const start = Date.now();
    while (Date.now() - start < 2500) {
      if (graphql.length || pending.length) { await wait(400); break; }
      await wait(200);
    }
    return drain();
  }
  return {
    session: {
      async open(url) {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
        return settle();
      },
      async scroll() {
        await page.mouse.wheel(0, 700 + Math.floor(Math.random() * 500));
        return settle();
      },
      async download(url) {
        const res = await context.request.get(url, { timeout: 20_000 });
        if (!res.ok()) return null;
        const type = (res.headers()["content-type"] || "").toLowerCase();
        if (type && !type.startsWith("image/")) return null;
        const buf = Buffer.from(await res.body());
        return buf.length >= 800 ? buf : null;
      },
    },
    // Close only the tab this run opened. Do not call browser.close(): that can quit the operator's Chrome.
    close: () => page.close().catch(() => {}),
  };
}

if (a.flags.saved) {
  try {
    const files = savedFiles(a.flags.saved);
    if (!files.length) throw new Error("No .html / .mhtml files in --saved path");
    const pages = files.map((file) => {
      const parsed = savedPageHtml(fs.readFileSync(file, "utf8"), path.basename(file));
      return { html: parsed.html, url: parsed.url };
    });
    const grab = runGrabSaved(pages, { max: Number(a.flags.max) || MAX_ITEMS });
    const id = grab.sellerId || itemIdFromUrl(grab.entryUrl) || "seller";
    const out = path.resolve(String(a.flags.out || path.join(repoRoot, "data", "prospects", `${id}.json`)));
    const warn = outputWarning(out, repoRoot);
    if (warn) console.error(warn);
    await writeGrab(grab, out);
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exit(e?.code === "sellers" ? 6 : 1);
  }
  process.exit(0);
}

let endpoint;
try {
  endpoint = assertLocalCdp(String(a.flags.cdp || "http://127.0.0.1:9222"));
  a._.forEach((u) => assertGrabUrls([canonicalFacebookUrl(u)]));
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}

const id = profileIdFromUrl(a._[0]) || itemIdFromUrl(a._[0]) || "seller";
const out = path.resolve(String(a.flags.out || path.join(repoRoot, "data", "prospects", `${id}.json`)));
const warn = outputWarning(out, repoRoot);
if (warn) console.error(warn);

let conn;
try {
  conn = await connect(endpoint);
  const grab = await runGrab({
    session: conn.session,
    urls: a._,
    max: Number(a.flags.max) || MAX_ITEMS,
    maxScrolls: a.flags.scrolls == null ? undefined : Number(a.flags.scrolls),
    sleep: () => wait(paceMs()),
  });
  await writeGrab(grab, out, async (url) => {
    try {
      const via = await conn.session.download(url);
      if (via) return via;
    } catch { /* fall through */ }
    return fetchPhoto(url);
  });
  process.exitCode = grab.stopped === "rate" ? 4 : 0;
} catch (e) {
  const code = e && e.code;
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = code === "login" ? 5 : code === "sellers" ? 6 : 1;
} finally {
  if (conn) await conn.close();
}
process.exit(process.exitCode ?? 0);
