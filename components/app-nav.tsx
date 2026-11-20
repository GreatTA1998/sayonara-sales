"use client";
import { useEffect, useState } from "react";
import {
  AUTH_EVT, adminPath, ensureShopId, getId, getName, getProfile, openShop, saveProfile,
} from "@/lib/shop";

type Props = {
  /** Home is the only page with navbar on top. */
  top?: boolean;
  onAuth?: () => void;
};

type N = 1 | 2 | 3; // nav exp · nav3 edge: 1 none · 2 thin · 3 figma
const NAV_KEY = "sayonara-nav-exp";
const EDGE_KEY = "sayonara-nav3-edge";

function readParam(key: string, lsKey: string, fallback: N): N {
  try {
    const q = new URLSearchParams(location.search).get(key);
    if (q === "1" || q === "2" || q === "3") {
      localStorage.setItem(lsKey, q);
      return +q as N;
    }
    const ls = localStorage.getItem(lsKey);
    if (ls === "1" || ls === "2" || ls === "3") return +ls as N;
  } catch { /* SSR / private */ }
  return fallback;
}

function writeParam(key: string, lsKey: string, n: N) {
  try {
    localStorage.setItem(lsKey, String(n));
    const u = new URL(location.href);
    u.searchParams.set(key, String(n));
    history.replaceState(null, "", u);
  } catch { /* ignore */ }
}

/** State-aware app chrome: logo+サヨナラ | 出品/マイ出品 | login/LINE名 (+ profile popover). */
export default function AppNav({ top, onAuth }: Props) {
  const [name, setName] = useState("");
  const [shopId, setShopId] = useState("");
  const [loginOpen, setLoginOpen] = useState(false);
  const [profOpen, setProfOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [bio, setBio] = useState("");
  const [jimoty, setJimoty] = useState("");
  const [exp, setExp] = useState<N>(1);
  const [edge, setEdge] = useState<N>(2);

  function sync() {
    const n = getName();
    setName(n);
    setShopId(getId());
    const p = getProfile();
    setBio(p.bio);
    setJimoty(p.jimotyUrl);
  }
  useEffect(() => {
    sync();
    setExp(readParam("nav", NAV_KEY, 1));
    setEdge(readParam("nav3", EDGE_KEY, 2));
    window.addEventListener(AUTH_EVT, sync);
    return () => window.removeEventListener(AUTH_EVT, sync);
  }, []);

  function pickExp(n: N) {
    setExp(n);
    writeParam("nav", NAV_KEY, n);
  }
  function pickEdge(n: N) {
    setEdge(n);
    writeParam("nav3", EDGE_KEY, n);
  }

  function saveLogin(e: { preventDefault(): void }) {
    e.preventDefault();
    if (!openShop(draft)) return;
    setLoginOpen(false);
    onAuth?.();
  }

  function saveProf(e: { preventDefault(): void }) {
    e.preventDefault();
    saveProfile({ bio, jimotyUrl: jimoty });
    setProfOpen(false);
  }

  const sellHref = shopId ? adminPath(shopId) : "#";
  const sellLabel = name ? "マイ出品" : "出品";
  const logged = !!name;

  return (
    <>
      <nav className={`app-nav${top ? " top" : " bot"} nav-exp-${exp}${exp === 3 ? ` nav3-e${edge}` : ""}`} aria-label="アプリ">
        <a href="/" className="brand" aria-label="サヨナラ ホーム">
          <img className="logo" src="/sun-logo.png" alt="" width={52} height={27} />
          <span>サヨナラ</span>
        </a>
        <a className="nav-a" href={sellHref}
          onClick={(e) => {
            if (shopId) return;
            e.preventDefault();
            const id = ensureShopId();
            setShopId(id);
            window.location.href = adminPath(id);
          }}>{sellLabel}</a>
        {logged ? (
          <button type="button" className="nav-a" onClick={() => setProfOpen(true)}>{name}</button>
        ) : (
          <button type="button" className="nav-a" onClick={() => { setDraft(getName()); setLoginOpen(true); }}>ログイン</button>
        )}
      </nav>

      <div className="nav-exp-sw" role="group" aria-label="ナビ実験">
        {([1, 2, 3] as N[]).map((n) => (
          <button key={n} type="button" className={exp === n ? "on" : undefined}
            aria-pressed={exp === n} onClick={() => pickExp(n)}>{n}</button>
        ))}
        {exp === 3 && (<>
          <hr className="sep" />
          {([[1, "∅", "縁なし"], [2, "─", "細い線"], [3, "·", "Figma風"]] as const).map(([n, lab, a]) => (
            <button key={n} type="button" className={edge === n ? "on" : undefined}
              aria-pressed={edge === n} aria-label={a} onClick={() => pickEdge(n)}>{lab}</button>
          ))}
        </>)}
      </div>

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
            <p className="hint" style={{ marginTop: 10 }}>より安全なLINE連携は準備中</p>
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
