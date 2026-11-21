import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import sharp from "sharp";
import { shopFromUrl, uid } from "@/lib/store";

export const dynamic = "force-dynamic";

const MAX = 1600;
const QUALITY = 82;

async function compress(file: File) {
  const buf = Buffer.from(await file.arrayBuffer());
  return sharp(buf)
    .rotate()
    .resize({ width: MAX, height: MAX, fit: "inside", withoutEnlargement: true })
    .webp({ quality: QUALITY })
    .toBuffer();
}

/** Blob photo upload only — client writes Firestore item docs. */
export async function POST(req: Request) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ error: "Blob not configured" }, { status: 500 });
  }
  try {
    const shop = shopFromUrl(req);
    const form = await req.formData();
    const file = form.get("file");
    const itemId = String(form.get("itemId") || "") || uid("i");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file required" }, { status: 400 });
    }
    const mime = (file.type || "").toLowerCase();
    if (mime && !mime.startsWith("image/") && mime !== "application/octet-stream") {
      return NextResponse.json({ error: "Image only" }, { status: 400 });
    }
    const body = await compress(file);
    const blob = await put(`sayonara-photos/${shop}/${itemId}-${Date.now()}.webp`, body, {
      access: "public",
      contentType: "image/webp",
    });
    return NextResponse.json({
      url: blob.url,
      itemId,
      bytesIn: file.size,
      bytesOut: body.length,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Upload failed" }, { status: 400 });
  }
}
