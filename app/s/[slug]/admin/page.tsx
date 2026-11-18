"use client";
import { useParams } from "next/navigation";
import { unslug } from "@/lib/shop";

/** Stub admin — Blob multi-key TODO. */
export default function StubAdmin() {
  const { slug } = useParams<{ slug: string }>();
  return (
    <main className="wrap">
      <p className="hint">Admin · {unslug(slug || "")}</p>
      <h1>出品管理（仮）</h1>
      <p className="hint">本編 UI は後で接続。Blob キー分離は TODO。</p>
      <p><a href={`/s/${slug}`}>購入者ビュー</a> · <a href="/">ハブ</a></p>
    </main>
  );
}
