"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { getId, getName } from "@/lib/shop";

/** Stub admin — Blob multi-key TODO. */
export default function StubAdmin() {
  const { slug } = useParams<{ slug: string }>();
  const id = slug || "";
  const [label, setLabel] = useState(id);
  useEffect(() => { setLabel(getId() === id ? (getName() || id) : id); }, [id]);
  return (
    <main className="wrap">
      <header className="bar">
        <a href="/" className="home" aria-label="ホーム">ホーム</a>
      </header>
      <p className="hint">Admin · {label} · {id}</p>
      <h1>出品管理（仮）</h1>
      <p className="hint">本編 UI は後で接続。Blob キー分離は TODO。</p>
      <p><a href={`/s/${id}`}>購入者ビュー</a></p>
    </main>
  );
}
