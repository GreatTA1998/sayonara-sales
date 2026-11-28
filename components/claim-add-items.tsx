"use client";
import { useMemo, useState } from "react";
import { dayLbl } from "@/lib/days";
import { claimAddBlock, claimAddHard, holderStatus, searchItems, slotTime, type Claim, type Item, type Store } from "@/lib/store";

const MAX = 8;

/** Admin 依頼の品目追加: text search over the shop's items, tap a result to add it. */
export function ClaimAddItems({ claim, shop, busy, onAdd }: {
  claim: Pick<Claim, "id" | "day" | "itemIds">; shop: Pick<Store, "items" | "claims">; busy: boolean;
  onAdd: (it: Item, opts: { force: boolean; cancelEmpty: boolean }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const rows = useMemo(() => (
    searchItems(shop.items, q).map((it) => {
      const holder = holderStatus(shop, it);
      return { it, hard: claimAddHard(it, claim, holder), soft: claimAddBlock(it, claim, holder) };
    })
  ), [shop, claim, q]);
  if (!open) {
    return <button type="button" className="claim-add-open" onClick={() => setOpen(true)}>＋ 品目を追加</button>;
  }
  const shown = rows.filter((r) => r.hard !== "追加済み").slice(0, MAX);
  /** Owner override: short confirm naming the other request, then add (moving it if held). */
  function pick(it: Item, soft: string | null) {
    if (!soft) { onAdd(it, { force: false, cancelEmpty: false }); return; }
    const name = it.name?.trim() || "無題";
    const other = it.claimId && it.claimId !== claim.id ? shop.claims.find((c) => c.id === it.claimId) : undefined;
    let msg = `「${name}」は${soft}です。この依頼に追加しますか？`;
    let cancelEmpty = false;
    if (other && ["requested", "booked"].includes(other.status)) {
      const left = other.itemIds.filter((x) => x !== it.id).length;
      cancelEmpty = left === 0;
      msg = `「${name}」は${other.contact || "別の買い手"}さんの依頼（${dayLbl(other.day)} ${slotTime(other.slot) || ""}）にあります。こちらに移しますか？`
        + (cancelEmpty ? "\n移すとその依頼は品目がなくなり、キャンセルされます。" : "");
    }
    if (window.confirm(msg)) onAdd(it, { force: true, cancelEmpty });
  }
  return (
    <div className="claim-add" role="group" aria-label="品目を追加">
      <div className="claim-add-bar">
        <input type="search" value={q} autoFocus placeholder="品目名で検索" aria-label="品目名で検索"
          autoComplete="off" onChange={(e) => setQ(e.target.value)} />
        <button type="button" aria-label="閉じる" onClick={() => { setOpen(false); setQ(""); }}>✕</button>
      </div>
      {q.trim() && !shown.length ? <p className="hint">追加できる該当品目がありません</p> : null}
      <ul className="claim-add-list">
        {shown.map(({ it, hard, soft }) => (
          <li key={it.id}>
            <button type="button" disabled={!!hard || busy} onClick={() => pick(it, soft)}>
              <span className="n">{it.name?.trim() || "無題"}</span>
              <span className="p">{it.price != null ? `¥${it.price.toLocaleString("ja-JP")}` : ""}</span>
              <span className="s">{hard || soft || "受付中"}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
