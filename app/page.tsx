"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getName, setName, slugify } from "@/lib/shop";

const DIR = [{ slug: "elton", name: "エルトン", area: "目黒区" }];

export default function HubPage() {
  const router = useRouter();
  const [name, setN] = useState("");
  const [near, setNear] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { const n = getName(); if (n) router.replace(`/s/${slugify(n)}`); }, [router]);

  function go(e: { preventDefault(): void }) {
    e.preventDefault();
    const n = setName(name);
    if (n) router.push(`/s/${slugify(n)}`);
  }

  function askNear() {
    if (!navigator.geolocation) { setNear("位置情報が使えません"); return; }
    setBusy(true); setNear(null);
    navigator.geolocation.getCurrentPosition(
      (p) => { setNear(`付近（仮） ${p.coords.latitude.toFixed(3)}, ${p.coords.longitude.toFixed(3)}`); setBusy(false); },
      () => { setNear("位置を取得できませんでした"); setBusy(false); },
      { timeout: 8000 },
    );
  }

  return (
    <main className="wrap hub">
      <h1>Sayonara Sales</h1>
      <p className="hint">ジモティー風の引越し出品。まとめて選んで依頼できるので、LINEの個別やりとりが不要。</p>
      <p className="hint">LINE名で自分の店を開く（エルトン在庫とは別）。</p>
      <form className="field" onSubmit={go}>
        <label className="float"><span>LINE名</span>
          <input value={name} onChange={(e) => setN(e.target.value)} placeholder="表示名" autoComplete="nickname" /></label>
        <button type="submit" className="dark" disabled={!name.trim()}>自分の店を開く</button>
      </form>
      <section className="field">
        <span>セール地図（仮）</span>
        <div className="map-ph" aria-hidden="true">地図プレースホルダ</div>
        <button type="button" className="ghost" onClick={askNear} disabled={busy}>{busy ? "取得中…" : "近くを見る"}</button>
        {near && <p className="hint">{near}</p>}
        <ul className="dir">{DIR.map((s) => <li key={s.slug}><a href={`/s/${s.slug}`}>{s.name}</a> · {s.area}</li>)}</ul>
      </section>
      <p className="hint"><a href="/s/elton">エルトンのセール</a> · <a href="/admin">エルトン Admin</a></p>
    </main>
  );
}
