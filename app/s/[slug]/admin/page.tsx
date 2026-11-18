"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { getId, getName } from "@/lib/shop";

/** Admin shell for independent ids — mirrors Elton admin path shape. Blob TODO. */
export default function StubAdmin() {
  const { slug } = useParams<{ slug: string }>();
  const id = slug || "";
  const [label, setLabel] = useState(id);
  useEffect(() => { setLabel(getId() === id ? (getName() || id) : id); }, [id]);
  return (
    <main className="wrap">
      <header className="bar">
        <a href="/" className="home" aria-label="ホーム">ホーム</a>
        <span className="who"><span className="shop">{label}</span></span>
        <a className="req" href={`/s/${id}`} style={{ textDecoration: "none", background: "#eee" }}>見る</a>
      </header>
      <p className="hint">Admin</p>
      <h1>出品管理</h1>
      <p className="hint">本編の写真出品 UI は Blob キー分離後に接続（TODO）。id {id}</p>
    </main>
  );
}
