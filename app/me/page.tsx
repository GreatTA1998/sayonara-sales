"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { LineLoginLink } from "@/components/line-oauth";
import { SoftLoginForm } from "@/components/soft-login";
import { dayLbl } from "@/lib/days";
import {
  adminPath, getJimotyName, getLineName, getLineUid, getName, listBuys, logout, subscribeAuth, type BuyRow,
} from "@/lib/shop";

const when = (day: string, slot?: string, who?: string) => [who, `${dayLbl(day)}${slot ? ` ${slot}` : ""}`].filter(Boolean).join(" · ");
const pts = (names: (string | undefined | null)[]) => { const n = names.map((x) => x?.trim() || "無題"); return n.length <= 1 ? `1点 · ${n[0] || "無題"}` : `${n.length}点 · ${n[0]}…`; };
const row = (label: string, value: string) => (
  <li><span>{label}</span><b>{value}</b></li>
);

export default function MePage() {
  const router = useRouter();
  const name = useSyncExternalStore(subscribeAuth, getName, () => "");
  const jimoty = useSyncExternalStore(subscribeAuth, getJimotyName, () => "");
  const lineName = useSyncExternalStore(subscribeAuth, getLineName, () => "");
  const hard = useSyncExternalStore(subscribeAuth, getLineUid, () => "");
  const [buys, setBuys] = useState<BuyRow[]>([]);
  useEffect(() => {
    const sync = () => setBuys(listBuys());
    sync(); return subscribeAuth(sync);
  }, [name]);

  return (
    <main className="wrap">
      <h1>{name || "マイページ"}</h1>
      {!name ? (
        <SoftLoginForm className="soft-login" onDone={(id) => { if (id) router.push(adminPath(id)); }} />
      ) : (
        <>
          <section className="acct" aria-label="アカウント連携">
            <div className="claims-h">アカウント</div>
            <ul>
              {row("ジモティ名", jimoty || "未設定")}
              {row("LINE名", lineName || "未設定")}
              {row("LINEアカウント", hard ? "連携済み" : "未連携")}
            </ul>
          </section>
          {!hard && (
            <>
              <p className="hint">任意：あとでLINEでアカウントを保護できます</p>
              <LineLoginLink />
            </>
          )}
          <button type="button" className="cta soft" onClick={() => { void logout(); }}>ログアウト</button>
        </>
      )}
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
