"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { getId, getName } from "@/lib/shop";

/** Stub buyer. Real Blob per-slug = TODO in lib/store.ts. Elton stays at /s/elton. */
export default function StubShop() {
  const { slug } = useParams<{ slug: string }>();
  const id = slug || "";
  const [label, setLabel] = useState(id);
  const [mine, setMine] = useState(false);
  useEffect(() => {
    const m = getId() === id;
    setMine(m);
    setLabel(m ? (getName() || id) : id);
  }, [id]);
  return (
    <main className="wrap">
      <header className="bar">
        <a href="/" className="home" aria-label="ホーム">ホーム</a>
      </header>
      <h1>{label || "ショップ"}</h1>
      <p className="hint">独立ショップ（スタブ）· {id}。Blob 分離は TODO。出品はまだありません。</p>
      {mine && <p><a className="dark" href={`/s/${id}/admin`} style={{ display: "inline-block", textDecoration: "none" }}>Admin</a></p>}
      <p className="hint"><a href="/s/elton">エルトン</a></p>
    </main>
  );
}
