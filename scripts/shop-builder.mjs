#!/usr/bin/env node
/**
 * Build one unclaimed shop from a JSON file. No browser session.
 * SHOP_BUILDER_API_TOKEN is required. SHOP_BUILDER_API_BASE defaults to production.
 * SHOP_BUILDER_AGENT_ID overrides the file's agentId.
 */
import fs from "node:fs";
import path from "node:path";

const base = (process.env.SHOP_BUILDER_API_BASE || "https://sayonara.tokyo").replace(/\/$/, "");
const token = process.env.SHOP_BUILDER_API_TOKEN || "";
const dry = process.argv.includes("--dry-run");
const file = process.argv.slice(2).find((a) => !a.startsWith("--"));

if (!file) {
  console.error("usage: node scripts/shop-builder.mjs <shop.json> [--dry-run]");
  process.exit(1);
}
if (!token) {
  console.error("SHOP_BUILDER_API_TOKEN is required");
  process.exit(1);
}

const abs = path.resolve(file);
const input = JSON.parse(fs.readFileSync(abs, "utf8"));
const agentId = (process.env.SHOP_BUILDER_AGENT_ID || input.agentId || "").trim();
if (!/^[A-Za-z0-9._:-]{1,80}$/.test(agentId)) {
  console.error("Set agentId in the JSON or SHOP_BUILDER_AGENT_ID");
  process.exit(1);
}

const mimeOf = (name) => {
  const ext = path.extname(name).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  return "image/jpeg";
};

class Stop extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

async function api(pathname, { method = "GET", body, ifMatch, form } = {}) {
  const headers = { authorization: `Bearer ${token}`, "x-agent-id": agentId };
  if (ifMatch != null) headers["if-match"] = `"${ifMatch}"`;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) {
    headers["content-type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await fetch(`${base}${pathname}`, { method, headers, body: payload });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; }
  catch { json = { error: text }; }
  return { status: res.status, json, rev: json && typeof json.rev === "number" ? json.rev : null };
}

function stop(res) {
  if (res.status === 423) {
    const who = res.json?.lease?.agentId || "someone";
    throw new Stop(2, `lease held by ${who} until ${res.json?.lease?.expiresAt || ""}`);
  }
  if (res.status === 409 && res.json?.code === "claimed") {
    throw new Stop(3, `claimed ${res.json.url || res.json.id || ""}`);
  }
  throw new Stop(1, res.json?.error || `HTTP ${res.status}`);
}

const dir = path.dirname(abs);
const items = Array.isArray(input.items) ? input.items : undefined;
const apiItems = items?.map((it) => {
  const { photoFiles: _files, ...rest } = it;
  if (Array.isArray(it.photoFiles) && it.photoFiles.length) {
    rest.photos = Array.isArray(rest.photos) ? rest.photos : [];
  }
  return rest;
});

let exitCode = 0;
let leased = false;
let shopId = "";
let rev = null;
let lines = "";

try {
  const created = await api("/api/shop-builder/shops", {
    method: "POST",
    body: {
      externalSource: input.externalSource,
      ...(input.id ? { id: input.id } : {}),
      ...(input.settings ? { settings: input.settings } : {}),
      ...(apiItems ? { items: apiItems } : {}),
      lease: !dry,
      ...(dry ? { dryRun: true } : {}),
    },
  });
  if (created.status !== 200) stop(created);
  lines = `${created.json.url || ""}\n${created.json.editorUrl || ""}\n`;
  if (dry) {
    process.stdout.write(lines);
    process.exit(0);
  }
  shopId = created.json.id;
  rev = created.json.rev;
  leased = true;
  const byKey = new Map((created.json.items || []).map((it) => [it.externalKey, it]));
  for (const it of items || []) {
    const files = Array.isArray(it.photoFiles) ? it.photoFiles : [];
    if (!files.length) continue;
    const uploaded = [];
    for (const rel of files) {
      const filePath = path.resolve(dir, rel);
      const buf = fs.readFileSync(filePath);
      const fd = new FormData();
      fd.append("file", new Blob([buf], { type: mimeOf(filePath) }), path.basename(filePath));
      const up = await api(`/api/shop-builder/shops/${shopId}/photos`, { method: "POST", form: fd });
      if (up.status !== 200) stop(up);
      uploaded.push(up.json.photo?.url || up.json.url);
    }
    const current = byKey.get(it.externalKey);
    const photos = [...(current?.photos || []), ...uploaded.filter(Boolean)];
    const put = await api(
      `/api/shop-builder/shops/${shopId}/items/${encodeURIComponent(it.externalKey)}`,
      { method: "PUT", ifMatch: rev, body: { photos } },
    );
    if (put.status !== 200) stop(put);
    rev = put.rev;
    lines = `${put.json.url}\n${put.json.editorUrl}\n`;
  }
} catch (e) {
  exitCode = e instanceof Stop ? e.code : 1;
  console.error(e instanceof Error ? e.message : e);
} finally {
  if (leased && shopId && rev != null) {
    try {
      const released = await api(`/api/shop-builder/shops/${shopId}/lease`, { method: "DELETE", ifMatch: rev });
      if (released.status !== 200) {
        console.error(released.json?.error || "lease release failed");
        if (!exitCode) exitCode = 1;
      }
    } catch (e) {
      console.error(e instanceof Error ? e.message : e);
      if (!exitCode) exitCode = 1;
    }
  }
}

if (!exitCode && lines) process.stdout.write(lines);
process.exit(exitCode);
