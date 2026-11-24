"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AccountView } from "@/components/account-view";
import { Icon } from "@/components/icons";
import { useLineOAuthReturn } from "@/components/line-oauth";
import { SoftLoginForm } from "@/components/soft-login";
import { compressImage, ensureImageFile, isImageFile } from "@/lib/compress";
import { listenPendingRequests } from "@/lib/live";
import { adminPath, ensureShopId, getId, getName, LOGIN_OPEN_EVT, subscribeAuth } from "@/lib/shop";

type Shot = { preview: string; url?: string; err?: string };

const IMG_ACCEPT = "image/*,image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif";

/** brand+投稿一覧 · ヘルプ/ログイン|name account-pane — always bottom fixed */
export default function AppNav() {
  const router = useRouter();
  const path = usePathname() || "";
  const name = useSyncExternalStore(subscribeAuth, getName, () => "");
  const shopId = useSyncExternalStore(subscribeAuth, getId, () => "");
  const [open, setOpen] = useState<"help" | "me" | "">("");
  const [body, setBody] = useState("");
  const [shot, setShot] = useState<Shot | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(""); // "" | ok | "!err"
  const [reqN, setReqN] = useState(0);
  const shotRef = useRef<Shot | null>(null);
  shotRef.current = shot;

  useEffect(() => {
    if (shopId) router.prefetch(adminPath(shopId));
  }, [shopId, router]);
  useEffect(() => {
    if (!shopId) { setReqN(0); return; }
    return listenPendingRequests(shopId, setReqN);
  }, [shopId]);
  useLineOAuthReturn();
  useEffect(() => { setOpen(""); }, [path]);
  useEffect(() => {
    const openLogin = () => setOpen("me");
    window.addEventListener(LOGIN_OPEN_EVT, openLogin);
    return () => window.removeEventListener(LOGIN_OPEN_EVT, openLogin);
  }, []);
  useEffect(() => {
    if (!open) return;
    const sel = open === "help" ? ".nav-help" : ".nav-me";
    const close = (e: PointerEvent) => {
      if (!(e.target as Element).closest(sel)) setOpen("");
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  useEffect(() => () => {
    const p = shotRef.current?.preview;
    if (p?.startsWith("blob:")) URL.revokeObjectURL(p);
  }, []);

  async function takeShot(file: File) {
    if (!isImageFile(file)) return;
    const prev = shotRef.current?.preview;
    if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
    const preview = URL.createObjectURL(file);
    setShot({ preview });
    try {
      const compressed = await compressImage(ensureImageFile(file));
      const fd = new FormData();
      fd.set("file", compressed);
      fd.set("itemId", `help-${Date.now()}`);
      const res = await fetch("/api/admin/upload?shop=_help", { method: "POST", body: fd });
      const data = await res.json() as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error("up");
      setShot((s) => (s?.preview === preview ? { preview, url: data.url } : s));
    } catch {
      setShot((s) => (s?.preview === preview ? { preview, err: "画像アップロード失敗" } : s));
    }
  }

  async function sendHelp(e: { preventDefault(): void }) {
    e.preventDefault();
    if (!body.trim() || busy) return;
    if (shot && !shot.url && !shot.err) return; // still uploading
    setBusy(true); setMsg("");
    try {
      const text = body.trim();
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          body: text, title: text.slice(0, 80), path,
          href: typeof window !== "undefined" ? window.location.href : "",
          userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
          name: getName(), shopId: getId(),
          ...(shot?.url ? { screenshotUrl: shot.url } : {}),
        }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error || "送信失敗");
      setMsg("ありがとう。開発者がすぐ確認します。急ぎのバグはAIが直してサイトに反映することも。");
      setBody("");
      if (shot?.preview.startsWith("blob:")) URL.revokeObjectURL(shot.preview);
      setShot(null);
    } catch (err) {
      setMsg(`!${err instanceof Error ? err.message : "送信失敗"}`);
    } finally { setBusy(false); }
  }

  const sellHref = shopId ? adminPath(shopId) : "/";
  const sellOn = /\/s\/[^/]+\/admin\/?$/.test(path);
  const shotBusy = !!shot && !shot.url && !shot.err;
  const canSend = !!body.trim() && !busy && !shotBusy;
  const closeMe = () => setOpen("");

  return (
    <nav className="app-nav bot" aria-label="アプリ">
      <div className="app-nav-inner">
        <div className="nav-start">
          <Link href="/" className="brand" prefetch aria-label="サヨナラ ホーム">
            <img className="logo" src="/sun-logo.png" alt="" width={52} height={27} decoding="async" />
            <span>サヨナラ</span>
          </Link>
          <Link className={`nav-a${sellOn ? " on" : ""}`} href={sellHref} prefetch
            aria-current={sellOn ? "page" : undefined}
            onClick={(e) => {
              if (shopId) return;
              e.preventDefault();
              router.push(adminPath(ensureShopId()));
            }}>{shopId ? <>投稿一覧{reqN > 0 ? <span className="nav-badge" aria-label={`依頼${reqN}件`}>{reqN}</span> : null}</> : "投稿"}</Link>
        </div>
        <div className="nav-end">
          <div className="nav-help">
            <button type="button" className={`nav-a${open === "help" ? " on" : ""}`}
              aria-expanded={open === "help"} aria-haspopup="dialog"
              onClick={() => { setOpen(open === "help" ? "" : "help"); setMsg(""); }}>ヘルプ</button>
            {open === "help" && (
              <form className="menu-pop up pane help-pane" role="dialog" aria-label="ヘルプ" onSubmit={sendHelp}
                onPaste={(e) => {
                  const item = [...e.clipboardData.items].find((i) => i.type.startsWith("image/"));
                  if (!item) return;
                  const f = item.getAsFile();
                  if (!f) return;
                  e.preventDefault();
                  void takeShot(f);
                }}>
                <textarea className="grow" rows={1} value={body} onChange={(e) => setBody(e.target.value)}
                  placeholder="バグ・要望・質問" />
                {shot ? (
                  <div className="help-shot">
                    <img src={shot.preview} alt="" />
                    <button type="button" className="help-shot-x" aria-label="画像を削除"
                      onClick={() => {
                        if (shot.preview.startsWith("blob:")) URL.revokeObjectURL(shot.preview);
                        setShot(null);
                      }}>×</button>
                    {shotBusy ? <span className="hint">アップロード中…</span> : null}
                    {shot.err ? <span className="sw">{shot.err}</span> : null}
                  </div>
                ) : (
                  <label className="help-pic">
                    <Icon name="camera" size={18} />
                    <span>Ctrl+V / 貼り付けでスクショ可</span>
                    <input type="file" accept={IMG_ACCEPT} hidden aria-label="写真を追加"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        e.target.value = "";
                        if (f) void takeShot(f);
                      }} />
                  </label>
                )}
                {msg && <p className={msg.startsWith("!") ? "sw" : "hint"}>{msg.replace(/^!/, "")}</p>}
                <button type="submit" className="cta" disabled={!canSend}>
                  {busy ? "送信中…" : shotBusy ? "画像準備中…" : "送信"}
                </button>
              </form>
            )}
          </div>
          <div className="nav-me">
            <button type="button" className={`nav-a${open === "me" ? " on" : ""}`}
              aria-expanded={open === "me"} aria-haspopup="dialog"
              onClick={() => setOpen(open === "me" ? "" : "me")}>{name || "ログイン"}</button>
            {open === "me" && (name ? (
              <div className="menu-pop up pane help-pane me-pane" role="dialog" aria-label="アカウント">
                <AccountView onAfterLogout={closeMe} onNav={closeMe} />
              </div>
            ) : (
              <SoftLoginForm className="menu-pop up pane soft-login" autoFocus
                onDone={closeMe} />
            ))}
          </div>
        </div>
      </div>
    </nav>
  );
}
