"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useLineOAuthReturn } from "@/components/line-oauth";
import { adminPath, ensureShopId, getId, getName, subscribeAuth } from "@/lib/shop";
import type { ReportType } from "@/lib/report-types";
import "@/components/photo-layout.css";

type Props = { top?: boolean };

/** logo+サヨナラ | 投稿/投稿一覧 | HELP | ログイン/ジモティ名 → マイページ */
export default function AppNav({ top }: Props) {
  const router = useRouter();
  const path = usePathname() || "";
  const name = useSyncExternalStore(subscribeAuth, getName, () => "");
  const shopId = useSyncExternalStore(subscribeAuth, getId, () => "");
  const [helpOpen, setHelpOpen] = useState(false);
  const [helpType, setHelpType] = useState<ReportType>("bug");
  const [helpBody, setHelpBody] = useState("");
  const [helpBusy, setHelpBusy] = useState(false);
  const [helpErr, setHelpErr] = useState("");
  const [helpOk, setHelpOk] = useState(false);

  useEffect(() => {
    if (shopId) router.prefetch(adminPath(shopId));
    router.prefetch("/me");
  }, [shopId, router]);
  useLineOAuthReturn();

  async function sendHelp(e: { preventDefault(): void }) {
    e.preventDefault();
    if (!helpBody.trim() || helpBusy) return;
    setHelpBusy(true); setHelpErr(""); setHelpOk(false);
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: helpType,
          body: helpBody.trim(),
          title: helpType === "bug" ? helpBody.trim().slice(0, 80) : undefined,
          path,
          href: typeof window !== "undefined" ? window.location.href : "",
          userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
          name: getName(),
          shopId: getId(),
        }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error || "送信失敗");
      setHelpOk(true);
      setHelpBody("");
    } catch (err) {
      setHelpErr(err instanceof Error ? err.message : "送信失敗");
    } finally { setHelpBusy(false); }
  }

  const sellHref = shopId ? adminPath(shopId) : "/";
  const sellOn = /\/s\/[^/]+\/admin\/?$/.test(path);
  const helpOn = path === "/admin";
  const meOn = path === "/me" || path.startsWith("/me/");

  return (
    <>
      <nav className={`app-nav${top ? " top" : " bot"}`} aria-label="アプリ">
        <div className="app-nav-inner">
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
          <button type="button" className={`nav-a${helpOn ? " on" : ""}`}
            aria-current={helpOn ? "page" : undefined}
            onClick={() => { setHelpOpen(true); setHelpOk(false); setHelpErr(""); }}>HELP</button>
          <Link className={`nav-a${meOn ? " on" : ""}`} href="/me" prefetch
            aria-current={meOn ? "page" : undefined}>{name || "ログイン"}</Link>
        </div>
      </nav>

      {helpOpen && (
        <div className="mask" role="dialog" aria-modal="true" aria-label="HELP"
          onClick={() => setHelpOpen(false)}>
          <form className="sheet" onClick={(e) => e.stopPropagation()} onSubmit={sendHelp}>
            <h2>HELP</h2>
            <p className="hint">バグ報告か、メッセージ／リクエストを送れます。</p>
            <div className="seg" role="group" aria-label="種類">
              <button type="button" className={helpType === "bug" ? "on" : ""}
                onClick={() => setHelpType("bug")}>バグ</button>
              <button type="button" className={helpType === "message" ? "on" : ""}
                onClick={() => setHelpType("message")}>メッセージ</button>
            </div>
            <label className="float"><span>{helpType === "bug" ? "何が起きた？" : "メッセージ"}</span>
              <textarea className="grow" rows={4} value={helpBody}
                onChange={(e) => setHelpBody(e.target.value)}
                placeholder={helpType === "bug" ? "再現手順・期待した動き" : "要望や質問"}
                autoFocus /></label>
            {helpErr && <p className="sw">{helpErr}</p>}
            {helpOk && <p className="hint">送信しました。ありがとう。</p>}
            <button type="submit" className="cta go" disabled={!helpBody.trim() || helpBusy}>
              {helpBusy ? "送信中…" : "送信"}
            </button>
            <Link href="/admin" className="cta soft" style={{ marginTop: 8 }}
              onClick={() => setHelpOpen(false)}>報告 inbox を見る</Link>
          </form>
        </div>
      )}
    </>
  );
}
