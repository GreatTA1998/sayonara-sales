import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { checkAdmin } from "@/lib/auth";
import { withStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const pw = req.headers.get("x-admin-password");
  if (!checkAdmin(pw)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    // Store may be private (Vercel Blob project default) or public; prefer public URLs for buyer thumbs.
    let blob;
    try {
      blob = await put(`sayonara-photos/${itemId}-${Date.now()}.${ext}`, file, {
        access: "public",
        contentType: file.type || "image/jpeg",
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (!/private store/i.test(msg)) throw e;
      blob = await put(`sayonara-photos/${itemId}-${Date.now()}.${ext}`, file, {
        access: "private",
        contentType: file.type || "image/jpeg",
      });
    }
    const item = await withStore((s) => {
      const it = s.items.find((i) => i.id === itemId);
      if (!it) throw new Error("Not found");
      it.photos = [...(it.photos || []), blob.url];
      return it;
    });
    return NextResponse.json({ url: blob.url, photos: item.photos });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Upload failed" }, { status: 400 });
  }
}
