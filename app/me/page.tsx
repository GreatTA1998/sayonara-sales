"use client";
import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { LineLoginLink } from "@/components/line-oauth";
import { dayLbl } from "@/lib/days";
import { listenShop } from "@/lib/live";
import { adminPath, getId, getName, listBuys, logout, openShop, subscribeAuth, type BuyRow } from "@/lib/shop";

type Claim = { id: string; day: string; slot?: string; contact?: string; itemIds: string[]; status: string };
type Item = { id: string; name: string };
const when = (day: string, slot?: string, who?: string) => [who, `${dayLbl(day)}${slot ? ` ${slot}` : ""}`].filter(Boolean).join(" · ");
const pts = (names: (string | undefined | null)[]) => { const n = names.map((x) => x?.trim() || "無題"); return n.length <= 1 ? `1点 · ${n[0] || "無題"}` : `${n.length}点 · ${n[0]}…`; };

export default function MePage() {
  const name = useSyncExternalStore(subscribeAuth, getName, () => "");
  const shopId = useSyncExternalStore(subscribeAuth, getId, () => "");
  const [draft, setDraft] = useState("");
  const [buys, setBuys] = useState<BuyRow[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [selling, setSelling] = useState<Claim[]>([]);
  useEffect(() => {
    const sync = () => { setDraft(getName()); setBuys(listBuys()); };
    sync(); return subscribeAuth(sync);
  }, [name]);
  useEffect(() => {
    const id = getId();
    if (!id) { setItems([]); setSelling([]); return; }
    return listenShop(id, (s) => {
      setItems(s.items.map((i) => ({ id: i.id, name: i.name })));
      setSelling(s.claims.filter((c) => c.status !== "cancelled"));
    }, undefined, { claimOwner: true });
  }, [shopId, name]);

  if (!name) {
    return (
      <main className="wrap">
        <h1>マイページ</h1>
        <form onSubmit={(e) => { e.preventDefault(); openShop(draft); }}>
          <p className="hint">ジモティ名だけでOK（パスワードなし）。LINE連携は任意。</p>
          <label className="float"><span>ジモティ名</span>
            <input value={draft} onChange={(e) => setDraft(e.target.value)}
              placeholder="表示名" autoComplete="nickname" autoFocus /></label>
          <button type="submit" className="cta go" disabled={!draft.trim()}>サインイン</button>
          <LineLoginLink />
        </form>
      </main>
    );
  }

  return (
    <main className="wrap">
      <h1>{name}</h1>
      <p className="hint" style={{ marginBottom: 12 }}>ショップメモ・Jimoty・内見動画は投稿一覧で編集</p>
      <p style={{ display: "flex", flexDirection: "column", gap: 8, margin: "0 0 16px" }}>
        {shopId ? <Link className="cta soft" href={`/s/${shopId}`} prefetch>ショップを見る</Link> : null}
        <Link className="cta soft" href={shopId ? adminPath(shopId) : "/admin"} prefetch>投稿一覧</Link>
      </p>
      <section className="claims">
        <div className="claims-h">買う · 引き取り履歴</div>
        {buys.length ? <ul className="timeline">{buys.map((b) => (
          <li key={`${b.code}-${b.at}`}><Link className="tl-card" href={`/s/${b.shop}`} prefetch>
            <b className="tl-when">{when(b.day, b.slot, b.code)}</b>
            <span className="tl-sum">{pts(b.items)}</span></Link></li>
        ))}</ul> : null}
      </section>
      <section className="claims">
        <div className="claims-h">売る · 引き取り履歴</div>
        {selling.length ? <ul className="timeline">{selling.map((c) => (
          <li key={c.id}><div className="tl-card" style={{ cursor: "default" }}>
            <b className="tl-when">{when(c.day, c.slot, c.contact)}{c.status === "picked_up" ? " · 受取済" : c.status === "requested" ? " · 未確定" : ""}</b>
            <span className="tl-sum">{pts(c.itemIds.map((id) => items.find((i) => i.id === id)?.name))}</span>
          </div></li>
        ))}</ul> : null}
      </section>
      <LineLoginLink />
      <button type="button" className="cta soft" style={{ marginTop: 12 }}
        onClick={() => { void logout().then(() => { setSelling([]); setDraft(""); }); }}>ログアウト</button>
    </main>
  );
}
