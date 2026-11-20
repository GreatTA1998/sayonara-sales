/** Client-side resize + compress before upload (server sharp still finalizes). */
const MAX = 1600;
const QUALITY = 0.82;

const EXT_MIME: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
  gif: "image/gif", heic: "image/heic", heif: "image/heif", avif: "image/avif",
};

/** Camera/OS quirks: empty MIME, octet-stream, image/jpg — still treat as image. */
export function isImageFile(f: File) {
  const t = (f.type || "").toLowerCase();
  if (!t || t === "application/octet-stream") return true;
  if (t.startsWith("image/")) return true;
  return /\.(jpe?g|png|webp|gif|heic|heif|avif|bmp|tiff?)$/i.test(f.name || "");
}

/** Ensure upload FormData has an image/* type (server rejects empty MIME). */
export function ensureImageFile(file: File): File {
  if (file.type.startsWith("image/")) return file;
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  const type = EXT_MIME[ext] || "image/jpeg";
  const name = file.name?.includes(".") ? file.name : `photo.${ext || "jpg"}`;
  return new File([file], name, { type, lastModified: file.lastModified });
}

function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    return createImageBitmap(file).catch(() => loadImg(file));
  }
  return loadImg(file);
}

function loadImg(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("画像を読めません")); };
    img.src = url;
  });
}

function toBlob(canvas: HTMLCanvasElement, type: string, q: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, q));
}

/** Long-edge ≤1600, WebP (else JPEG) @ 0.82. HEIC/GIF → pass through for server sharp. */
export async function compressImage(file: File): Promise<File> {
  const f = ensureImageFile(file);
  if (/gif|heic|heif/i.test(f.type)) return f;
  if (!f.type.startsWith("image/")) return f;
  try {
    const src = await loadBitmap(f);
    const w0 = "naturalWidth" in src ? src.naturalWidth : src.width;
    const h0 = "naturalHeight" in src ? src.naturalHeight : src.height;
    if (!w0 || !h0) return f;
    const scale = Math.min(1, MAX / Math.max(w0, h0));
    const w = Math.max(1, Math.round(w0 * scale));
    const h = Math.max(1, Math.round(h0 * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return f;
    ctx.drawImage(src, 0, 0, w, h);
    if ("close" in src) src.close();
    const webp = await toBlob(canvas, "image/webp", QUALITY);
    const blob = (webp && webp.size > 0) ? webp : await toBlob(canvas, "image/jpeg", QUALITY);
    if (!blob || blob.size >= f.size) return f;
    const ext = blob.type === "image/webp" ? "webp" : "jpg";
    const base = f.name.replace(/\.[^.]+$/, "") || "photo";
    return new File([blob], `${base}.${ext}`, { type: blob.type, lastModified: Date.now() });
  } catch {
    return f;
  }
}
