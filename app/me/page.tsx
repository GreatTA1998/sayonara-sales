"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { LineLoginLink } from "@/components/line-oauth";
import { dayLbl } from "@/lib/days";
import { adminPath, getLineUid, getName, listBuys, logout, softLogin, subscribeAuth, type BuyRow } from "@/lib/shop";

const when = (day: string, slot?: string, who?: string) => [who, `${dayLbl(day)}${slot ? ` ${slot}` : ""}`].filter(Boolean).join(" · ");
const pts = (names: (string | undefined | null)[]) => { const n = names.map((x) => x?.trim() || "無題"); return n.length <= 1 ? `1点 · ${n[0] || "無題"}` : `${n.length}点 · ${n[0]}…`; };

export default function MePage() {
  const router = useRouter();
  const name = useSyncExternalStore(subscribeAuth, getName, () => "");
  const hard = useSyncExternalStore(subscribeAuth, getLineUid, () => "");
  const [jimoty, setJimoty] = useState("");
  const [line, setLine] = useState("");
  const [buys, setBuys] = useState<BuyRow[]>([]);
  useEffect(() => {
    const sync = () => setBuys(listBuys());
    sync(); return subscribeAuth(sync);
  }, [name]);

  return (
    <main className="wrap">
      <h1>{name || "マイページ"}</h1>
      {!name && (
        <form onSubmit={(e) => {
          e.preventDefault();
          if (!jimoty.trim() && !line.trim()) return;
          const id = softLogin(jimoty, line);
          setJimoty(""); setLine("");
          if (id) router.push(adminPath(id));
        }}>
          <label className="float"><span>ジモティ名</span>
            <input value={jimoty} onChange={(e) => setJimoty(e.target.value)}
              placeholder="ジモティ名" autoComplete="nickname" />
          </label>
          <label className="float"><span>LINE名</span>
            <input value={line} onChange={(e) => setLine(e.target.value)}
              placeholder="LINE名" autoComplete="nickname" />
          </label>
          <button type="submit" className="cta go" disabled={!jimoty.trim() && !line.trim()}>サインイン</button>
        </form>
      )}
      {name ? <button type="button" className="cta soft" onClick={() => { void logout(); }}>ログアウト</button> : null}
      {!hard && <LineLoginLink />}
      <section className="claims">
        <div className="claims-h">買う · 引き取り履歴</div>
        {buys.length ? <ul className="timeline">{buys.map((b) => (
          <li key={`${b.code}-${b.at}`}><Link className="tl-card" href={`/s/${b.shop}`} prefetch>
            <b className="tl-when">{when(b.day, b.slot, b.code)}</b>
            <span className="tl-sum">{pts(b.items)}</span></Link></li>
        ))}</ul> : null}
      </section>
    </main>
  );
}
