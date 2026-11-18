"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { getName, unslug } from "@/lib/shop";

/** Stub buyer. Real Blob per-slug = TODO in lib/store.ts */
export default function StubShop() {
  const { slug } = useParams<{ slug: string }>();
  const label = unslug(slug || "");
  const [mine, setMine] = useState(false);
  useEffect(() => { setMine(getName().toLowerCase() === label.toLowerCase()); }, [label]);
  return (
    <main className="wrap">
      <h1>{label || "ショップ"}</h1>
      <p className="hint">独立ショップ（スタブ）。Blob 分離は TODO。出品はまだありません。</p>
      {mine && <p><a className="dark" href={`/s/${slug}/admin`} style={{ display: "inline-block", textDecoration: "none" }}>Admin</a></p>}
      <p className="hint"><a href="/">ハブ</a> · <a href="/s/elton">エルトン</a></p>
    </main>
  );
}
