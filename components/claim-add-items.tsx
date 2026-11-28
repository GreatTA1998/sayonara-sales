"use client";
import { useMemo, useState } from "react";
import { claimAddBlock, holderStatus, searchItems, type Claim, type Item, type Store } from "@/lib/store";

const MAX = 8;

/** Admin 依頼の品目追加: text search over the shop's items, tap a result to add it. */
export function ClaimAddItems({ claim, shop, busy, onAdd }: {
  claim: Pick<Claim, "id" | "day" | "itemIds">; shop: Pick<Store, "items" | "claims">; busy: boolean; onAdd: (it: Item) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const rows = useMemo(() => (
    searchItems(shop.items, q).map((it) => ({ it, why: claimAddBlock(it, claim, holderStatus(shop, it)) }))
  ), [shop, claim, q]);
  if (!open) {
    return <button type="button" className="claim-add-open" onClick={() => setOpen(true)}>＋ 品目を追加</button>;
  }
  const shown = rows.filter((r) => r.why !== "追加済み").slice(0, MAX);
  return (
    <div className="claim-add" role="group" aria-label="品目を追加">
      <div className="claim-add-bar">
        <input type="search" value={q} autoFocus placeholder="品目名で検索" aria-label="品目名で検索"
          autoComplete="off" onChange={(e) => setQ(e.target.value)} />
        <button type="button" aria-label="閉じる" onClick={() => { setOpen(false); setQ(""); }}>✕</button>
      </div>
      {q.trim() && !shown.length ? <p className="hint">追加できる該当品目がありません</p> : null}
      <ul className="claim-add-list">
        {shown.map(({ it, why }) => (
          <li key={it.id}>
            <button type="button" disabled={!!why || busy} onClick={() => onAdd(it)}>
              <span className="n">{it.name?.trim() || "無題"}</span>
              <span className="p">{it.price != null ? `¥${it.price.toLocaleString("ja-JP")}` : ""}</span>
              <span className="s">{why || "受付中"}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
