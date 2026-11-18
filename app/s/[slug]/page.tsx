"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { getId, getName } from "@/lib/shop";

/** Buyer shell for independent ids. Blob per-id = TODO; Elton = /s/elton. */
export default function StubBuyer() {
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
    <main className="buy">
      <header className="bar">
        <a href="/" className="home" aria-label="ホーム">ホーム</a>
        <span className="who">
          <span className="shop">{label || id}</span>
        </span>
        {mine && <a className="req" href={`/s/${id}/admin`} style={{ textDecoration: "none" }}>Admin</a>}
      </header>
      <p className="hint intro">出品はまだありません（データ分離 TODO）。</p>
    </main>
  );
}
