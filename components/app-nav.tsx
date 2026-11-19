"use client";
import { useEffect, useState } from "react";
import { ensureShopId, getId, getName, getProfile, openShop, saveProfile } from "@/lib/shop";

type Props = {
  /** Home is the only page with navbar on top. */
  top?: boolean;
  onAuth?: () => void;
};

/** State-aware app chrome: logo+サヨナラ | 出品/マイ出品 | login/LINE名 (+ profile popover). */
export default function AppNav({ top, onAuth }: Props) {
  const [name, setName] = useState("");
  const [shopId, setShopId] = useState("");
  const [loginOpen, setLoginOpen] = useState(false);
  const [profOpen, setProfOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [bio, setBio] = useState("");
  const [jimoty, setJimoty] = useState("");

  function sync() {
    const n = getName();
    setName(n);
    setShopId(getId());
    const p = getProfile();
    setBio(p.bio);
    setJimoty(p.jimotyUrl);
  }
  useEffect(() => { sync(); }, []);

  function saveLogin(e: { preventDefault(): void }) {
    e.preventDefault();
    const id = openShop(draft);
    if (!id) return;
    setShopId(id);
    setName(draft.trim());
    setLoginOpen(false);
    onAuth?.();
  }

  function saveProf(e: { preventDefault(): void }) {
    e.preventDefault();
    saveProfile({ bio, jimotyUrl: jimoty });
    setProfOpen(false);
  }

  const sellHref = shopId ? `/s/${shopId}/admin` : "#";
  const sellLabel = name ? "マイ出品" : "出品";
  const logged = !!name;

  return (
    <>
      <nav className={`app-nav${top ? " top" : " bot"}`} aria-label="アプリ">
        <a href="/" className="brand" aria-label="サヨナラ ホーム">
          <span className="logo" aria-hidden="true" />
          <span>サヨナラ</span>
        </a>
        <a className="nav-a" href={sellHref}
          onClick={(e) => {
            if (shopId) return;
            e.preventDefault();
            ensureShopId();
            setShopId(getId());
            window.location.href = `/s/${getId()}/admin`;
          }}>{sellLabel}</a>
        {logged ? (
          <button type="button" className="nav-a" onClick={() => setProfOpen(true)}>{name}</button>
        ) : (
          <button type="button" className="nav-a" onClick={() => { setDraft(""); setLoginOpen(true); }}>ログイン</button>
        )}
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
            <button type="submit" className="cta go" disabled={!draft.trim()}>保存</button>
            <p className="hint" style={{ marginTop: 10 }}>より安全なLINE連携は準備中</p>
          </form>
        </div>
      )}

      {profOpen && (
        <div className="mask" role="dialog" aria-modal="true" aria-label="プロフィール"
          onClick={() => setProfOpen(false)}>
          <form className="sheet" onClick={(e) => e.stopPropagation()} onSubmit={saveProf}>
            <h2>{name}</h2>
            <label className="float"><span>自己紹介</span>
              <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3}
                placeholder="短い紹介" /></label>
            <label className="float"><span>ジモティーURL（任意）</span>
              <input value={jimoty} onChange={(e) => setJimoty(e.target.value)}
                placeholder="https://jmty.jp/…" inputMode="url" autoComplete="url" /></label>
            <button type="submit" className="cta go">保存</button>
          </form>
        </div>
      )}
    </>
  );
}
