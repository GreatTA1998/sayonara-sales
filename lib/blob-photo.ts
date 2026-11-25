import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { put } from "@vercel/blob";
import sharp from "sharp";
import { LIMITS } from "./shop-limits";

const MAX = 1600;
const QUALITY = 82;

export class BlobPhotoError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export function isStoredPhoto(url: string) {
  try {
    const u = new URL(url);
    return u.protocol === "https:"
      && (u.hostname === "blob.vercel-storage.com" || u.hostname.endsWith(".blob.vercel-storage.com"));
  } catch {
    return false;
  }
}

function blockedIp(ip: string) {
  const v = ip.toLowerCase();
  if (v === "::1" || v.startsWith("fe80:") || v.startsWith("fc") || v.startsWith("fd")) return true;
  const m = v.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

async function assertPublicHttps(raw: string) {
  let url: URL;
  try { url = new URL(raw); }
  catch { throw new BlobPhotoError("Photo URL is invalid", 400); }
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new BlobPhotoError("Photo URL must be https", 400);
  }
  const host = url.hostname.toLowerCase().replace(/\.+$/, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host === "metadata.google.internal") {
    throw new BlobPhotoError("Photo URL is not allowed", 400);
  }
  const ips = isIP(host) ? [host] : (await lookup(host, { all: true })).map((r) => r.address);
  if (!ips.length || ips.some(blockedIp)) throw new BlobPhotoError("Photo URL is not allowed", 400);
  return url;
}

async function fetchImage(raw: string) {
  let current = raw;
  for (let hop = 0; hop < 3; hop++) {
    const url = await assertPublicHttps(current);
    const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(15_000) });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) throw new BlobPhotoError("Photo URL redirect is invalid", 400);
      current = new URL(loc, url).toString();
      continue;
    }
    if (!res.ok) throw new BlobPhotoError(`Photo URL returned ${res.status}`, 400);
    const len = Number(res.headers.get("content-length") || 0);
    if (len > LIMITS.photoBytes) throw new BlobPhotoError("Photo is too large", 400);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > LIMITS.photoBytes) throw new BlobPhotoError("Photo is too large", 400);
    return buf;
  }
  throw new BlobPhotoError("Photo URL redirected too many times", 400);
}

async function compress(bytes: Buffer) {
  try {
    return await sharp(bytes)
      .rotate()
      .resize({ width: MAX, height: MAX, fit: "inside", withoutEnlargement: true })
      .webp({ quality: QUALITY })
      .toBuffer();
  } catch {
    throw new BlobPhotoError("Image only", 400);
  }
}

function assertImageMime(type: string) {
  const mime = type.toLowerCase();
  if (mime && !mime.startsWith("image/") && mime !== "application/octet-stream") {
    throw new BlobPhotoError("Image only", 400);
  }
}

/** Same blob path and WebP settings as the shop editor upload. */
export async function storeShopPhoto(
  shop: string,
  itemId: string,
  file: File | Buffer,
  opts?: { stub?: boolean; dry?: boolean; bytesIn?: number },
) {
  let bytes: Buffer;
  let bytesIn: number;
  if (Buffer.isBuffer(file)) {
    bytes = file;
    bytesIn = opts?.bytesIn ?? file.length;
  } else {
    assertImageMime(file.type || "");
    if (file.size > LIMITS.photoBytes) throw new BlobPhotoError("Photo is too large", 400);
    bytes = Buffer.from(await file.arrayBuffer());
    bytesIn = file.size;
  }
  if (bytes.length > LIMITS.photoBytes) throw new BlobPhotoError("Photo is too large", 400);
  const body = await compress(bytes);
  if (opts?.dry) return { url: "", bytesIn, bytesOut: body.length };
  if (opts?.stub) {
    return {
      url: `https://stub.public.blob.vercel-storage.com/sayonara-photos/${shop}/${itemId}.webp`,
      bytesIn,
      bytesOut: body.length,
    };
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) throw new BlobPhotoError("Blob not configured", 500);
  const blob = await put(`sayonara-photos/${shop}/${itemId}-${Date.now()}.webp`, body, {
    access: "public",
    contentType: "image/webp",
  });
  return { url: blob.url, bytesIn, bytesOut: body.length };
}

export async function storeShopPhotoFromUrl(shop: string, itemId: string, raw: string, opts?: { stub?: boolean }) {
  if (isStoredPhoto(raw)) return raw;
  if (opts?.stub) {
    let url: URL;
    try { url = new URL(raw); }
    catch { throw new BlobPhotoError("Photo URL is invalid", 400); }
    if (url.protocol !== "https:") throw new BlobPhotoError("Photo URL must be https", 400);
    return `https://stub.public.blob.vercel-storage.com/sayonara-photos/${shop}/${itemId}.webp`;
  }
  const buf = await fetchImage(raw);
  return (await storeShopPhoto(shop, itemId, buf, { bytesIn: buf.length })).url;
}
