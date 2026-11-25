import { NextResponse } from "next/server";
import { BlobPhotoError, storeShopPhoto } from "@/lib/blob-photo";
import { shopFromUrl, uid } from "@/lib/store";

export const dynamic = "force-dynamic";

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
    const stored = await storeShopPhoto(shop, itemId, file);
    return NextResponse.json({
      url: stored.url,
      itemId,
      bytesIn: stored.bytesIn,
      bytesOut: stored.bytesOut,
    });
  } catch (e) {
    const status = e instanceof BlobPhotoError ? e.status : 400;
    return NextResponse.json({ error: e instanceof Error ? e.message : "Upload failed" }, { status });
  }
}
