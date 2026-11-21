"use client";
import { useEffect, useRef, useState } from "react";
import { useBodyScrollLock } from "@/components/snack";

type Shot = { url: string; file: File };
type Props = {
  open: boolean;
  onClose: () => void;
  /** Each shutter (and album pick) — parent queues async create/upload. */
  onShot: (file: File) => void;
  accept: string;
  /** Create-listing tip under header; omit for edit/append. */
  tip?: string;
  /** Edit/append: 0-radius viewfinder inset to match strip padding; create keeps rounded. */
  sharp?: boolean;
};

const MAX = 1600;
const Q = 0.82;

function secureOk() {
  if (typeof window === "undefined") return false;
  return window.isSecureContext || ["localhost", "127.0.0.1"].includes(location.hostname);
}

/** Localhost-only fake stream so CI / desktop can exercise the UI without a camera. */
function fakeStream(): MediaStream {
  const canvas = document.createElement("canvas");
  canvas.width = 720;
  canvas.height = 960;
  const ctx = canvas.getContext("2d")!;
  const draw = () => {
    const t = Date.now() / 1000;
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(0, 0, 720, 960);
    ctx.fillStyle = "#F38A00";
    ctx.beginPath();
    ctx.arc(360 + Math.sin(t) * 40, 480, 120, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "28px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("プレビュー", 360, 500);
  };
  draw();
  const id = window.setInterval(draw, 200);
  const stream = canvas.captureStream(5);
  stream.getTracks().forEach((tr) => {
    const stop = tr.stop.bind(tr);
    tr.stop = () => { clearInterval(id); stop(); };
  });
  return stream;
}

async function encodeSquare(canvas: HTMLCanvasElement, stem: string): Promise<File> {
  const blob = await new Promise<Blob | null>((res) => {
    canvas.toBlob(res, "image/webp", Q);
  }).then(async (b) => b && b.size > 0 ? b : new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", Q)));
  if (!blob) throw new Error("キャプチャ失敗");
  const ext = blob.type === "image/webp" ? "webp" : "jpg";
  return new File([blob], `${stem}-${Date.now()}.${ext}`, { type: blob.type, lastModified: Date.now() });
}

async function squareFromVideo(video: HTMLVideoElement): Promise<File> {
  const vw = video.videoWidth, vh = video.videoHeight;
  if (!vw || !vh) throw new Error("カメラ準備中");
  const side = Math.min(vw, vh);
  const sx = (vw - side) / 2, sy = (vh - side) / 2;
  const out = Math.min(side, MAX);
  const canvas = document.createElement("canvas");
  canvas.width = out;
  canvas.height = out;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("キャプチャ失敗");
  ctx.drawImage(video, sx, sy, side, side, 0, 0, out, out);
  return encodeSquare(canvas, "cam");
}

/** Center-crop any album image to a real 1:1 file (same as shutter). */
async function squareFromFile(file: File): Promise<File> {
  const bmp = await createImageBitmap(file);
  try {
    const side = Math.min(bmp.width, bmp.height);
    if (!side) throw new Error("画像を読めません");
    const sx = (bmp.width - side) / 2, sy = (bmp.height - side) / 2;
    const out = Math.min(side, MAX);
    const canvas = document.createElement("canvas");
    canvas.width = out;
    canvas.height = out;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("キャプチャ失敗");
    ctx.drawImage(bmp, sx, sy, side, side, 0, 0, out, out);
    return encodeSquare(canvas, "alb");
  } finally {
    bmp.close();
  }
}

/** Mercari-like 1:1 camera: live preview, real square files (shutter + album), rounded viewfinder affordance. */
export default function SquareCam({ open, onClose, onShot, accept, tip, sharp }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const albumRef = useRef<HTMLInputElement>(null);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [shots, setShots] = useState<Shot[]>([]);
  const [tab, setTab] = useState<"cam" | "album">("cam");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  useBodyScrollLock(open);

  function stopStream() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setReady(false);
  }

  function clearShots() {
    setShots((prev) => {
      prev.forEach((s) => URL.revokeObjectURL(s.url));
      return [];
    });
  }

  async function startCam(face: "environment" | "user") {
    stopStream();
    setErr(null);
    setReady(false);
    if (!secureOk()) {
      setErr("カメラはHTTPS（またはlocalhost）で使えます。アルバムから選んでください。");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setErr("この端末ではカメラを使えません。アルバムから選んでください。");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: face }, width: { ideal: 1280 }, height: { ideal: 1280 } },
      });
      streamRef.current = stream;
      const v = videoRef.current;
      if (v) {
        v.srcObject = stream;
        await v.play().catch(() => undefined);
      }
      setReady(true);
    } catch (e) {
      const name = e instanceof DOMException ? e.name : "";
      const isLocal = ["localhost", "127.0.0.1"].includes(location.hostname);
      // Desktop/CI often has no camera — fake preview only on localhost so we can still test shutter/strip.
      if (isLocal && (name === "NotFoundError" || name === "DevicesNotFoundError" || name === "NotReadableError")) {
        try {
          const stream = fakeStream();
          streamRef.current = stream;
          const v = videoRef.current;
          if (v) {
            v.srcObject = stream;
            await v.play().catch(() => undefined);
          }
          setReady(true);
          return;
        } catch { /* fall through */ }
      }
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        setErr("カメラ許可が必要です。設定で許可するか、アルバムから選んでください。");
      } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        setErr("カメラが見つかりません。アルバムから選んでください。");
      } else {
        setErr("カメラを起動できません。アルバムから選んでください。");
      }
    }
  }

  useEffect(() => {
    if (!open) {
      stopStream();
      clearShots();
      setTab("cam");
      setErr(null);
      return;
    }
    void startCam(facing);
    return () => { stopStream(); };
  }, [open, facing]);

  async function shutter() {
    const v = videoRef.current;
    if (!v || !ready || busy) return;
    setBusy(true);
    try {
      const file = await squareFromVideo(v);
      const url = URL.createObjectURL(file);
      setShots((s) => [...s, { url, file }]);
      onShot(file);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "撮影に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  function flip() {
    setFacing((f) => (f === "environment" ? "user" : "environment"));
  }

  function close() {
    stopStream();
    clearShots();
    onClose();
  }

  function done() {
    stopStream();
    // Keep object URLs only in parent listings; strip URLs can go.
    clearShots();
    onClose();
  }

  async function onAlbum(files: File[]) {
    setBusy(true);
    try {
      for (const raw of files) {
        try {
          const file = await squareFromFile(raw);
          const url = URL.createObjectURL(file);
          setShots((s) => [...s, { url, file }]);
          onShot(file);
        } catch (e) {
          setErr(e instanceof Error ? e.message : "アルバム写真の処理に失敗しました");
        }
      }
    } finally {
      setBusy(false);
      setTab("cam");
    }
  }

  if (!open) return null;

  return (
    <div className="scam" role="dialog" aria-modal="true" aria-label="カメラ">
      <header className="scam-h">
        <button type="button" className="scam-x" aria-label="閉じる" onClick={close}>×</button>
        <span className="scam-title">カメラ</span>
        <button type="button" className="scam-next" disabled={!shots.length} onClick={done}>次へ</button>
      </header>
      {tip ? <p className="scam-tip hint">{tip}</p> : null}

      <div className={`scam-view${sharp ? " sharp" : ""}`}>
        <video ref={videoRef} className="scam-video" playsInline muted autoPlay />
        {err && (
          <div className="scam-err">
            <p>{err}</p>
            <button type="button" className="scam-album-cta" onClick={() => albumRef.current?.click()}>
              アルバムから選ぶ
            </button>
          </div>
        )}
      </div>

      <div className="scam-strip" aria-label="撮影した写真">
        {shots.map((s) => (
          <img key={s.url} src={s.url} alt="" className="scam-thumb" />
        ))}
        {Array.from({ length: Math.max(0, 6 - shots.length) }).map((_, i) => (
          <span key={`e${i}`} className="scam-slot" aria-hidden="true" />
        ))}
      </div>

      <div className="scam-ctrl">
        <span className="scam-side" aria-hidden="true" />
        <button type="button" className="scam-shutter" aria-label="シャッター"
          disabled={!ready || busy || !!err} onClick={() => void shutter()} />
        <button type="button" className="scam-flip" aria-label="カメラ切替"
          disabled={!!err} onClick={flip}>切替</button>
      </div>

      <nav className="scam-tabs" aria-label="撮影モード">
        <button type="button" className={tab === "album" ? "on" : ""}
          onClick={() => { setTab("album"); albumRef.current?.click(); }}>アルバム</button>
        <button type="button" className={tab === "cam" ? "on" : ""}
          onClick={() => setTab("cam")}>カメラ</button>
      </nav>

      <input ref={albumRef} type="file" accept={accept} multiple hidden
        onChange={(e) => {
          const files = Array.from(e.target.files || []);
          e.target.value = "";
          if (files.length) void onAlbum(files);
        }} />
    </div>
  );
}
