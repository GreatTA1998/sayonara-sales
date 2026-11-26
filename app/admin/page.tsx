"use client";
import { useCallback, useEffect, useState } from "react";
import type { Report } from "@/lib/report-types";
import { deleteUnclaimedShop, listUnclaimedShops, type UnclaimedShop } from "@/lib/live";
import "@/components/photo-layout.css";

type Tab = "help" | "shops";

function metaLine(r: Report) {
  return [
    new Date(r.createdAt).toLocaleString("ja-JP"),
    r.name, r.shopId ? `shop ${r.shopId}` : "", r.path, r.autofix ? `autofix:${r.autofix}` : "",
  ].filter(Boolean).join(" · ");
}

export default function AdminInbox() {
  const [tab, setTab] = useState<Tab>("help");
  const [reports, setReports] = useState<Report[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [shops, setShops] = useState<UnclaimedShop[]>([]);
  const [delId, setDelId] = useState<string | null>(null);
  const [delTyped, setDelTyped] = useState("");
  const [delBusy, setDelBusy] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(true);

  const loadHelp = useCallback(async () => {
    setBusy(true); setErr("");
    try {
      const res = await fetch("/api/reports", { cache: "no-store" });
      const data = await res.json() as { reports?: Report[]; error?: string };
      if (!res.ok) throw new Error(data.error || "読込失敗");
      setReports(data.reports || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "読込失敗");
    } finally { setBusy(false); }
  }, []);

  const loadShops = useCallback(async () => {
    setBusy(true); setErr("");
    try {
      setShops(await listUnclaimedShops());
    } catch (e) {
      setErr(e instanceof Error ? e.message : "読込失敗");
    } finally { setBusy(false); }
  }, []);

  useEffect(() => {
    if (tab === "help") void loadHelp();
    else void loadShops();
  }, [tab, loadHelp, loadShops]);

  const active = reports.find((r) => r.id === sel) || null;

  async function confirmDelete() {
    if (!delId || delTyped !== "OK" || delBusy) return;
    setDelBusy(true); setErr("");
    try {
      await deleteUnclaimedShop(delId);
      setShops((rows) => rows.filter((s) => s.id !== delId));
      setDelId(null); setDelTyped("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "削除失敗");
    } finally { setDelBusy(false); }
  }

  return (
    <main className="wrap inbox">
      <h1>Admin</h1>
      <div className="inbox-tabs" role="tablist" aria-label="Admin">
        <button type="button" role="tab" className={tab === "help" ? "on" : ""}
          aria-selected={tab === "help"} onClick={() => { setTab("help"); setSel(null); }}>ヘルプ</button>
        <button type="button" role="tab" className={tab === "shops" ? "on" : ""}
          aria-selected={tab === "shops"} onClick={() => { setTab("shops"); setDelId(null); setDelTyped(""); }}>未クレーム</button>
      </div>
      {err ? <p className="err">{err}</p> : null}

      {tab === "help" ? (
        <>
          <p className="hint">ヘルプからの報告。リストで選び、本文を右（モバイルは下／切替）に表示。</p>
          {busy && !reports.length ? <p className="hint">読込中…</p> : null}
          {!busy && !reports.length ? <p className="hint">まだ報告はありません。</p> : null}
          {reports.length ? (
            <div className={`inbox-md${sel ? " show-detail" : ""}`}>
              <ul className="timeline inbox-list" aria-label="報告一覧">
                {reports.map((r) => (
                  <li key={r.id}>
                    <button type="button" className={`tl-card${sel === r.id ? " on" : ""}`}
                      aria-current={sel === r.id ? "true" : undefined}
                      onClick={() => setSel(r.id)}>
                      <span className="tl-when">{r.title || r.body.slice(0, 80)}</span>
                      <span className="tl-sum">{metaLine(r)}</span>
                    </button>
                  </li>
                ))}
              </ul>
              <div className="inbox-detail" aria-live="polite">
                {active ? (
                  <>
                    <button type="button" className="inbox-back" onClick={() => setSel(null)}>← 一覧</button>
                    <h2 className="inbox-title">{active.title || "報告"}</h2>
                    <p className="hint">{metaLine(active)}</p>
                    <p className="inbox-body">{active.body}</p>
                    {active.screenshotUrl ? (
                      <a className="help-shot-link" href={active.screenshotUrl} target="_blank" rel="noreferrer">
                        <img src={active.screenshotUrl} alt="" />
                      </a>
                    ) : null}
                    {active.autofixAgent ? (
                      <p className="hint">agent: {active.autofixAgent}</p>
                    ) : null}
                  </>
                ) : (
                  <p className="hint">報告を選ぶと本文が表示されます。</p>
                )}
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <>
          <p className="hint">ownerUid なしの dig5。削除は OK と入力した場合のみ。</p>
          {busy && !shops.length ? <p className="hint">読込中…</p> : null}
          {!busy && !shops.length ? <p className="hint">未クレームはありません。</p> : null}
          <ul className="timeline">{shops.map((s) => (
            <li key={s.id}>
              <article className="tl-card inbox-shop" style={{ cursor: "default" }}>
                <span className="tl-when">
                  <a href={`/s/${s.id}`}>{s.id}</a>
                  {s.published ? " · 公開" : " · 下書き"}
                  {s.address ? ` · ${s.address}` : ""}
                </span>
                <span className="tl-sum">
                  {s.updatedAt ? new Date(s.updatedAt).toLocaleString("ja-JP") : "—"}
                  {s.facebookUrl ? " · FB" : ""}
                  {s.jimotyUrl ? " · ジモティ" : ""}
                  {s.otherUrl ? " · 他" : ""}
                </span>
                <div className="inbox-shop-acts">
                  <a className="share" href={`/s/${s.id}`}>見る</a>
                  <a className="share" href={`/s/${s.id}/admin`}>管理</a>
                  {delId === s.id ? (
                    <span className="inbox-del">
                      <input value={delTyped} placeholder="OK" aria-label="OK と入力" autoFocus
                        onChange={(e) => setDelTyped(e.target.value)} disabled={delBusy} />
                      <button type="button" className="share danger"
                        disabled={delTyped !== "OK" || delBusy}
                        onClick={() => void confirmDelete()}>
                        {delBusy ? "削除中…" : "削除する"}
                      </button>
                      <button type="button" className="share" disabled={delBusy}
                        onClick={() => { setDelId(null); setDelTyped(""); }}>取消</button>
                    </span>
                  ) : (
                    <button type="button" className="share danger"
                      onClick={() => { setDelId(s.id); setDelTyped(""); }}>削除</button>
                  )}
                </div>
              </article>
            </li>
          ))}</ul>
        </>
      )}
    </main>
  );
}
