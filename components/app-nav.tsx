"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LineLoginLink, useLineOAuthReturn } from "@/components/line-oauth";
import {
  AUTH_EVT, adminPath, ensureShopId, getId, getName, getProfile, openShop, saveProfile,
} from "@/lib/shop";

type Props = {
  /** Home is the only page with navbar on top. */
  top?: boolean;
  onAuth?: () => void;
};

/** State-aware app chrome: logo+サヨナラ | 出品/マイ出品 | login/LINE名 (+ profile popover). */
export default function AppNav({ top, onAuth }: Props) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [shopId, setShopId] = useState("");
  const [loginOpen, setLoginOpen] = useState(false);
  const [profOpen, setProfOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [bio, setBio] = useState("");
  const [jimoty, setJimoty] = useState("");
  const [youtube, setYoutube] = useState("");
  const [path, setPath] = useState("");

  function sync() {
    const n = getName();
    setName(n);
    setShopId(getId());
    const p = getProfile();
    setBio(p.bio);
    setJimoty(p.jimotyUrl);
    setYoutube(p.youtubeUrl);
  }
  useEffect(() => {
    sync();
    setPath(location.pathname);
    window.addEventListener(AUTH_EVT, sync);
    return () => window.removeEventListener(AUTH_EVT, sync);
  }, []);
  // Prefetch マイ出品 so nav feels instant (cheap win vs full remount wait).
  useEffect(() => {
    router.prefetch(shopId ? adminPath(shopId) : "/admin");
  }, [shopId, router]);
  useLineOAuthReturn(sync);

  function saveLogin(e: { preventDefault(): void }) {
    e.preventDefault();
    if (!openShop(draft)) return;
    setLoginOpen(false);
    onAuth?.();
  }

  function saveProf(e: { preventDefault(): void }) {
    e.preventDefault();
    saveProfile({ bio, jimotyUrl: jimoty, youtubeUrl: youtube });
    setProfOpen(false);
  }

  const sellHref = shopId ? adminPath(shopId) : "/admin";
  const sellLabel = name ? "マイ出品" : "出品";
  const logged = !!name;
  const sellOn = path === "/admin" || /\/admin\/?$/.test(path);

  return (
    <>
      <nav className={`app-nav${top ? " top" : " bot"}`} aria-label="アプリ">
        {/* Cream bar is full-bleed; inner row matches page/shop content column. */}
        <div className="app-nav-inner">
          {/* Brand is identity, not a tab — never show active orange dot on home. */}
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
              setShopId(id);
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
          <form className="sheet" onClick={(e) => e.stopPropagation()} onSubmit={saveProf}>
            <h2>{name}</h2>
            <label className="float"><span>ショップメモ</span>
              <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3}
                placeholder="動作確認・値引き・引越し・車・まとめ買い優先など" /></label>
            <label className="float"><span>Jimoty profile（任意）</span>
              <input value={jimoty} onChange={(e) => setJimoty(e.target.value)}
                placeholder="https://jmty.jp/…" inputMode="url" autoComplete="url" /></label>
            <label className="float"><span>YouTube（アパート・任意）</span>
              <input value={youtube} onChange={(e) => setYoutube(e.target.value)}
                placeholder="https://youtu.be/…" inputMode="url" autoComplete="url" /></label>
            <button type="submit" className="cta go">保存</button>
            <p className="hint" style={{ marginTop: 10 }}>より安全に使う場合はLINE連携</p>
            <LineLoginLink />
          </form>
        </div>
      )}
    </>
  );
}
