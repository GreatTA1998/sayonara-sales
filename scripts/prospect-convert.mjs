#!/usr/bin/env node
/**
 * Grab JSON → shop-builder JSON. Fills facebookUrl, externalSource, names, prices, square photos.
 * Leaves address, slots, dates, and bundle splits in `review` for a person to set.
 * Does not call the API.
 *
 *   node scripts/prospect-convert.mjs data/prospects/seller.json
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import sharp from "sharp";
import { buildBlocked, convertGrab, outputWarning, parseArgs } from "./prospect.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const usage = "usage: node scripts/prospect-convert.mjs <grab.json> [--out dir] [--force]";

/** Center cover, no padding. Side is min(1600, width, height) so a small image is not enlarged. */
export async function cropSquare(bytes) {
  const meta = await sharp(bytes, { failOn: "none" }).rotate().metadata();
  const side = Math.min(1600, meta.width || 1, meta.height || 1);
  return sharp(bytes, { failOn: "none" })
    .rotate()
    .resize(side, side, { fit: "cover", position: "centre" })
    .jpeg({ quality: 82 })
    .toBuffer();
}

async function bytesFor(photo, grabDir) {
  if (photo?.file) return fs.readFileSync(path.resolve(grabDir, photo.file));
  if (!photo?.url) return null;
  const res = await fetch(photo.url, { redirect: "follow", signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(String(res.status));
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  const a = parseArgs(process.argv.slice(2));
  const file = a._[0];
  if (a.flags.help || !file) {
    console.error(usage);
    process.exit(a.flags.help ? 0 : 1);
  }
  const grabPath = path.resolve(file);
  const grab = JSON.parse(fs.readFileSync(grabPath, "utf8"));
  const slug = String(grab.sellerId || "shop").replace(/\W/g, "") || "shop";
  const dir = path.resolve(String(a.flags.out || path.join(path.dirname(grabPath), slug)));
  const shopPath = path.join(dir, "shop.json");
  const warn = outputWarning(shopPath, repoRoot);
  if (warn) console.error(warn);
  if (fs.existsSync(shopPath) && a.flags.force !== true) {
    console.error(`${shopPath} exists. Edit that file, or pass --force to overwrite it.`);
    process.exit(1);
  }
  const shop = convertGrab(grab);
  const byId = new Map((grab.listings || []).map((l) => [String(l.id), l]));
  fs.mkdirSync(path.join(dir, "photos"), { recursive: true });
  for (const item of shop.items) {
    const listing = byId.get(item.externalKey);
    const photos = (listing?.photos || []).slice(0, 12);
    const files = [];
    for (let i = 0; i < photos.length; i++) {
      try {
        const bytes = await bytesFor(photos[i], path.dirname(grabPath));
        if (!bytes) continue;
        const rel = `photos/${item.externalKey}-${i}.jpg`;
        fs.writeFileSync(path.join(dir, rel), await cropSquare(bytes));
        files.push(`./${rel}`);
      } catch {
        shop.review.warnings.push(`${item.externalKey}: photo ${i + 1} failed`);
      }
    }
    if (files.length) item.photoFiles = files;
  }
  fs.writeFileSync(shopPath, `${JSON.stringify(shop, null, 2)}\n`);
  const blocks = buildBlocked(shop);
  console.log(`${shopPath}  items=${shop.items.length}${blocks.length ? `  hold=${blocks.join(",")}` : ""}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
