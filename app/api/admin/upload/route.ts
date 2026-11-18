import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import sharp from "sharp";
import { withStore } from "@/lib/store";

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
    const form = await req.formData();
    const file = form.get("file");
    const itemId = String(form.get("itemId") || "");
    if (!(file instanceof File) || !itemId) {
      return NextResponse.json({ error: "file and itemId required" }, { status: 400 });
    }
    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "Image only" }, { status: 400 });
    }
    const body = await compress(file);
    const blob = await put(`sayonara-photos/${itemId}-${Date.now()}.webp`, body, {
      access: "public",
      contentType: "image/webp",
    });
    const item = await withStore((s) => {
      const it = s.items.find((i) => i.id === itemId);
      if (!it) throw new Error("Not found");
      it.photos = [...(it.photos || []), blob.url];
      return it;
    });
    return NextResponse.json({
      url: blob.url,
      photos: item.photos,
      bytesIn: file.size,
      bytesOut: body.length,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Upload failed" }, { status: 400 });
  }
}
