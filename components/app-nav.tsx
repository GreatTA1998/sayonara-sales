"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { LineLoginLink, useLineOAuthReturn } from "@/components/line-oauth";
import {
  adminPath, ensureShopId, getId, getName, openShop, subscribeAuth,
} from "@/lib/shop";

type Props = { top?: boolean };

export default function AppNav({ top }: Props) {
  const router = useRouter();
  const path = usePathname() || "";
  const name = useSyncExternalStore(subscribeAuth, getName, () => "");
  const shopId = useSyncExternalStore(subscribeAuth, getId, () => "");
  const [loginOpen, setLoginOpen] = useState(false);
  const [profOpen, setProfOpen] = useState(false);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    router.prefetch(shopId ? adminPath(shopId) : "/admin");
  }, [shopId, router]);
  useLineOAuthReturn();

  function saveLogin(e: { preventDefault(): void }) {
    e.preventDefault();
    if (!openShop(draft)) return;
    setLoginOpen(false);
  }

  const sellHref = shopId ? adminPath(shopId) : "/admin";
  const sellLabel = name ? "マイ出品" : "出品";
  const logged = !!name;
  const sellOn = path === "/admin" || /\/admin\/?$/.test(path);

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
              const id = ensureShopId();
              router.push(adminPath(id));
            }}>{sellLabel}</Link>
          {logged ? (
            <button type="button" className="nav-a" onClick={() => setProfOpen(true)}>{name}</button>
          ) : (
            <button type="button" className="nav-a" onClick={() => { setDraft(getName()); setLoginOpen(true); }}>ログイン</button>
          )}
        </div>
      </nav>

      {loginOpen && (
        <div className="mask" role="dialog" aria-modal="true" aria-label="ログイン"
          onClick={() => setLoginOpen(false)}>
          <form className="sheet" onClick={(e) => e.stopPropagation()} onSubmit={saveLogin}>
            <h2>ログイン</h2>
            <p className="hint">LINE名だけでOK（パスワードなし）</p>
            <label className="float"><span>LINE名</span>
              <input value={draft} onChange={(e) => setDraft(e.target.value)}
                placeholder="表示名" autoComplete="nickname" autoFocus /></label>
            <button type="submit" className="cta go" disabled={!draft.trim()}>サインイン</button>
            <p className="hint" style={{ marginTop: 10 }}>より安全に使う場合はLINE連携</p>
            <LineLoginLink />
          </form>
        </div>
      )}

      {profOpen && (
        <div className="mask" role="dialog" aria-modal="true" aria-label="プロフィール"
          onClick={() => setProfOpen(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <h2>{name}</h2>
            <p className="hint">ショップメモ・Jimoty・内見動画はマイ出品で編集</p>
            <LineLoginLink />
          </div>
        </div>
      )}
    </>
  );
}
