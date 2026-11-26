#!/usr/bin/env node
/**
 * Build ready shops concurrently, then take English screenshots in one Chrome,
 * then write a Messenger send queue. Does not claim, publish, or message anyone.
 * Does not build a shop that still has an unresolved time constraint or bundle.
 * Defaults to production. Pass --beta for beta.sayonara.tokyo. Skips shops another agent holds.
 *
 *   node scripts/prospect-batch.mjs data/prospects --concurrency 4
 */
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  SHOT, SOURCE, VARIANT_CYCLE, assignVariants, assertAgentId, buildBlocked, englishOk,
  otherAgent, outputWarning, parseArgs, pool, redact, resolveBase, sendRow, shotPaintReady,
  verifyShop,
} from "./prospect.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch { return null; }
}
const builder = path.join(repoRoot, "scripts", "shop-builder.mjs");
const usage = "usage: node scripts/prospect-batch.mjs <shop.json | dir> [more...] [--concurrency 4] [--dry-run] [--beta] [--queue file]";

function shopFiles(inputs) {
  const out = [];
  for (const raw of inputs) {
    const abs = path.resolve(raw);
    const st = fs.statSync(abs);
    if (!st.isDirectory()) { out.push(abs); continue; }
    for (const name of fs.readdirSync(abs)) {
      const child = path.join(abs, name);
      if (name === "shop.json") out.push(child);
      else if (fs.statSync(child).isDirectory() && fs.existsSync(path.join(child, "shop.json"))) {
        out.push(path.join(child, "shop.json"));
      }
    }
  }
  return [...new Set(out)];
}

function readShop(file) {
  const shop = JSON.parse(fs.readFileSync(file, "utf8"));
  shop.__file = file;
  return shop;
}

async function api(base, token, agentId, pathname) {
  const res = await fetch(`${base}${pathname}`, {
    headers: { authorization: `Bearer ${token}`, "x-agent-id": agentId },
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; }
  catch { json = { error: text.slice(0, 180) }; }
  return { status: res.status, json };
}

function runBuilder(file, env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [builder, file], { env });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => { stdout += d; });
    child.stderr.on("data", (d) => { stderr += d; });
    child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

async function shoot(browser, shopUrl, file) {
  const context = await browser.newContext({
    viewport: { width: SHOT.width, height: SHOT.height },
    locale: "en-US",
  });
  try {
    await context.addInitScript((key) => { localStorage.setItem(key, "en"); }, SHOT.langKey);
    const page = await context.newPage();
    await page.goto(shopUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
    try {
      await page.waitForFunction((key) => {
        const text = document.body?.innerText || "";
        return localStorage.getItem(key) === "en"
          && document.documentElement.lang === "en"
          && text.includes("Help")
          && text.includes("Request pickup")
          && !document.querySelector(".lang-splash");
      }, SHOT.langKey, { timeout: 20_000 });
    } catch { /* englishOk records the miss */ }
    const signals = await page.evaluate((key) => {
      const text = document.body?.innerText || "";
      return {
        saved: localStorage.getItem(key),
        lang: document.documentElement.lang,
        help: text.includes("Help"),
        cta: text.includes("Request pickup"),
        splash: !!document.querySelector(".lang-splash"),
      };
    }, SHOT.langKey);
    const ok = englishOk(signals);
    if (ok) {
      try {
        await page.waitForFunction(shotPaintReady, null, { timeout: 20_000 });
      } catch { /* still shoot; washed-out miss is worse than a late shot */ }
      await page.evaluate(async () => {
        const imgs = [...document.images].filter((img) => {
          const r = img.getBoundingClientRect();
          return r.width > 1 && r.height > 1;
        });
        await Promise.all(imgs.map((img) => (img.decode ? img.decode() : Promise.resolve()).catch(() => {})));
      });
      await new Promise((r) => setTimeout(r, SHOT.settleMs));
      fs.mkdirSync(path.dirname(file), { recursive: true });
      await page.screenshot({ path: file, type: "jpeg", quality: SHOT.quality });
    }
    return { ok, path: ok ? file : "", signals };
  } finally {
    await context.close();
  }
}

const a = parseArgs(process.argv.slice(2));
if (a.flags.help || !a._.length) {
  console.error(usage);
  process.exit(a.flags.help ? 0 : 1);
}

let base;
try { base = resolveBase(process.env.SHOP_BUILDER_API_BASE, { beta: a.flags.beta === true }); }
catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}

const files = shopFiles(a._);
if (!files.length) {
  console.error("no shop.json");
  process.exit(1);
}
const shops = files.map(readShop);
const held = [];
const ready = [];
for (const shop of shops) {
  const file = shop.__file;
  delete shop.__file;
  if (shop.externalSource?.source !== SOURCE) {
    held.push({ file, sellerId: shop.externalSource?.sellerId || "", blocks: ["source"] });
    continue;
  }
  const blocks = buildBlocked(shop);
  if (blocks.length) held.push({ file, sellerId: shop.externalSource.sellerId, blocks });
  else ready.push({ file, shop });
}

if (a.flags["dry-run"]) {
  for (const row of held) console.log(`hold  ${row.blocks.join(",")}  ${row.file}`);
  for (const row of ready) console.log(`build ${row.file}`);
  process.exit(0);
}

const concurrency = Math.min(8, Math.max(1, Number(a.flags.concurrency) || 4));
const token = process.env.SHOP_BUILDER_API_TOKEN || "";
let agentId = "";
if (ready.length) {
  if (!token) {
    console.error("SHOP_BUILDER_API_TOKEN is required");
    process.exit(1);
  }
  try { agentId = assertAgentId(process.env.SHOP_BUILDER_AGENT_ID); }
  catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  }
}

const built = [];
const failed = [];
const skipped = [];
const env = { ...process.env, SHOP_BUILDER_API_TOKEN: token, SHOP_BUILDER_API_BASE: base, SHOP_BUILDER_AGENT_ID: agentId };

await pool(concurrency, ready, async (row) => {
  const sellerId = row.shop.externalSource.sellerId;
  try {
    const q = new URLSearchParams({ source: SOURCE, sellerId });
    const list = await api(base, token, agentId, `/api/shop-builder/shops?${q}`);
    if (list.status !== 200) throw new Error(list.json?.error || `list HTTP ${list.status}`);
    const why = otherAgent(list.json?.shops?.[0], agentId);
    if (why) {
      skipped.push({ file: row.file, sellerId, reason: why });
      return;
    }
    const run = await runBuilder(row.file, env);
    if (run.code === 2 || run.code === 3) {
      skipped.push({ file: row.file, sellerId, reason: redact(run.stderr, token).trim() || `exit ${run.code}` });
      return;
    }
    if (run.code !== 0) throw new Error(redact(run.stderr, token).trim() || `exit ${run.code}`);
    const shopUrl = run.stdout.trim().split("\n").find((l) => /^https?:\/\//.test(l)) || "";
    const shopId = (shopUrl.match(/\/s\/(\d{5})(?:\/|$)/) || [])[1] || "";
    if (!shopId) throw new Error("builder did not print a shop URL");
    const got = await api(base, token, agentId, `/api/shop-builder/shops/${shopId}`);
    if (got.status !== 200) throw new Error(got.json?.error || `get HTTP ${got.status}`);
    const verified = verifyShop(got.json, row.shop);
    if (!verified.ok) {
      failed.push({ file: row.file, sellerId, shopId, shopUrl, error: "verify failed", checks: verified.checks });
      return;
    }
    built.push({ file: row.file, shop: row.shop, state: got.json, shopUrl, shopId });
  } catch (e) {
    failed.push({ file: row.file, sellerId, error: redact(e instanceof Error ? e.message : e, token) });
  }
});

const firstInput = path.resolve(a._[0]);
const queuePath = path.resolve(String(a.flags.queue || (
  fs.statSync(firstInput).isDirectory()
    ? path.join(firstInput, "send-queue.json")
    : path.join(path.dirname(files[0]), "send-queue.json")
)));
const shotDir = path.join(path.dirname(queuePath), "shots");
if (built.length) {
  let browser;
  try {
    const { chromium } = await import("playwright-core");
    browser = await chromium.launch({ channel: "chrome", headless: true });
    for (const row of built) {
      const shotPath = path.join(shotDir, `${row.shopId}.jpg`);
      try { row.shot = await shoot(browser, row.shopUrl, shotPath); }
      catch (e) {
        row.shot = { ok: false, path: "", signals: null, error: redact(e instanceof Error ? e.message : e, token) };
      }
    }
  } catch (e) {
    const error = redact(e instanceof Error ? e.message : e, token);
    for (const row of built) if (!row.shot) row.shot = { ok: false, path: "", signals: null, error };
  } finally {
    if (browser) await browser.close();
  }
}

const sends = [];
for (const row of built) {
  const send = sendRow(row.shop, row.state, row.shot);
  if (send.ready) sends.push(send);
  else failed.push({ file: row.file, sellerId: send.sellerId, shopId: row.shopId, shopUrl: row.shopUrl, error: "english screenshot failed", checks: send.checks });
}

const queueWarn = outputWarning(queuePath, repoRoot);
if (queueWarn) console.error(queueWarn);
fs.mkdirSync(path.dirname(queuePath), { recursive: true });
const variantPath = path.join(path.dirname(queuePath), "variant-next.json");
const savedNext = readJson(variantPath)?.next;
const kept = new Map();
for (const row of readJson(queuePath)?.sends || []) {
  if (row?.shopUrl && VARIANT_CYCLE.includes(row.variant)) kept.set(row.shopUrl, row.variant);
}
const assigned = assignVariants(sends, { next: savedNext, kept });
if (assigned.sends.length) fs.writeFileSync(variantPath, `${JSON.stringify({ next: assigned.next }, null, 2)}\n`);
const queue = {
  v: 1,
  createdAt: new Date().toISOString(),
  base,
  sends: assigned.sends,
  held,
  skipped,
  failed,
};
fs.writeFileSync(queuePath, `${JSON.stringify(queue, null, 2)}\n`);
console.log(`${queuePath}  send=${sends.length}  hold=${held.length}  skip=${skipped.length}  fail=${failed.length}`);
process.exit(failed.length ? 1 : 0);
