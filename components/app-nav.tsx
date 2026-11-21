"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useLineOAuthReturn } from "@/components/line-oauth";
import { adminPath, ensureShopId, getId, getName, logout, subscribeAuth } from "@/lib/shop";

type Props = { top?: boolean };

/** brand+投稿一覧 · ヘルプ/name menu-pop · ログイン→/me */
export default function AppNav({ top }: Props) {
  const router = useRouter();
  const path = usePathname() || "";
  const name = useSyncExternalStore(subscribeAuth, getName, () => "");
  const shopId = useSyncExternalStore(subscribeAuth, getId, () => "");
  const [open, setOpen] = useState<"help" | "prof" | "">("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(""); // "" | ok | "!err"

  useEffect(() => {
    if (shopId) router.prefetch(adminPath(shopId));
    router.prefetch("/me");
  }, [shopId, router]);
  useLineOAuthReturn();
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!(e.target as Element).closest(open === "help" ? ".nav-help" : ".nav-me")) setOpen("");
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  async function sendHelp(e: { preventDefault(): void }) {
    e.preventDefault();
    if (!body.trim() || busy) return;
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
        }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error || "送信失敗");
      setMsg("送信しました。ありがとう。"); setBody("");
    } catch (err) {
      setMsg(`!${err instanceof Error ? err.message : "送信失敗"}`);
    } finally { setBusy(false); }
  }

  const sellHref = shopId ? adminPath(shopId) : "/";
  const sellOn = /\/s\/[^/]+\/admin\/?$/.test(path);
  const meOn = path === "/me" || path.startsWith("/me/");
  const pop = `menu-pop${top ? "" : " up"}`;

  return (
    <nav className={`app-nav${top ? " top" : " bot"}`} aria-label="アプリ">
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
            }}>{name ? "投稿一覧" : "投稿"}</Link>
        </div>
        <div className="nav-end">
          <div className="nav-help">
            <button type="button" className={`nav-a${open === "help" ? " on" : ""}`}
              aria-expanded={open === "help"} aria-haspopup="dialog"
              onClick={() => { setOpen(open === "help" ? "" : "help"); setMsg(""); }}>ヘルプ</button>
            {open === "help" && (
              <form className={`${pop} help`} role="dialog" aria-label="ヘルプ" onSubmit={sendHelp}>
                <textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)}
                  placeholder="バグ・要望・質問" autoFocus />
                {msg && <p className={msg.startsWith("!") ? "sw" : "hint"}>{msg.replace(/^!/, "")}</p>}
                <button type="submit" disabled={!body.trim() || busy}>{busy ? "送信中…" : "送信"}</button>
              </form>
            )}
          </div>
          {name ? (
            <div className="nav-me">
              <button type="button" className={`nav-a${meOn || open === "prof" ? " on" : ""}`}
                aria-expanded={open === "prof"} aria-haspopup="menu"
                onClick={() => setOpen(open === "prof" ? "" : "prof")}>{name}</button>
              {open === "prof" && (
                <div className={pop} role="menu">
                  <button type="button" role="menuitem"
                    onClick={() => { setOpen(""); router.push("/me"); }}>履歴</button>
                  <button type="button" className="danger" role="menuitem"
                    onClick={() => { setOpen(""); void logout(); }}>ログアウト</button>
                </div>
              )}
            </div>
          ) : (
            <Link className="nav-a" href="/me" prefetch>ログイン</Link>
          )}
        </div>
      </div>
    </nav>
  );
}
