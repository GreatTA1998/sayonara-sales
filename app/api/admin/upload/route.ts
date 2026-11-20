import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import sharp from "sharp";
import { shopFromUrl, uid, withStore } from "@/lib/store";

export const dynamic = "force-dynamic";

const MAX = 1600;
const QUALITY = 82;

async function compress(file: File) {
  const buf = Buffer.from(await file.arrayBuffer());
  const out = await sharp(buf)
    .rotate()
    .resize({ width: MAX, height: MAX, fit: "inside", withoutEnlargement: true })
    .webp({ quality: QUALITY })
    .toBuffer();
  return out;
}

export async function POST(req: Request) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ error: "Blob not configured" }, { status: 500 });
  }
  try {
    const shop = shopFromUrl(req);
    const form = await req.formData();
    const file = form.get("file");
    const itemId = String(form.get("itemId") || "");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file required" }, { status: 400 });
    }
    // Camera/OS often sends empty or octet-stream MIME — trust bytes, sharp will reject junk.
    const mime = (file.type || "").toLowerCase();
    if (mime && !mime.startsWith("image/") && mime !== "application/octet-stream") {
      return NextResponse.json({ error: "Image only" }, { status: 400 });
    }
    const keyId = itemId || uid("i");
    const body = await compress(file);
    const blob = await put(`sayonara-photos/${shop}/${keyId}-${Date.now()}.webp`, body, {
      access: "public",
      contentType: "image/webp",
    });
    const item = await withStore(shop, (s) => {
      let it = itemId ? s.items.find((i) => i.id === itemId) : undefined;
      if (!it) {
        if (itemId) throw new Error("Not found");
        it = { id: keyId, name: "", price: 0, photos: [] };
        s.items.push(it);
      }
      it.photos = [...(it.photos || []), blob.url];
      return it;
    });
    return NextResponse.json({
      item,
      url: blob.url,
      photos: item.photos,
      bytesIn: file.size,
      bytesOut: body.length,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Upload failed" }, { status: 400 });
  }
}
