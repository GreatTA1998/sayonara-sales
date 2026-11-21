"use client";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import type { Report } from "@/lib/report-types";
import { ELTON_ID, getId, subscribeAuth } from "@/lib/shop";
import "@/components/photo-layout.css";

export default function ReportInbox() {
  const ok = useSyncExternalStore(subscribeAuth, getId, () => "") === ELTON_ID;
  const [reports, setReports] = useState<Report[]>([]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(true);

  const load = useCallback(async () => {
    if (!ok) { setBusy(false); return; }
    setBusy(true); setErr("");
    try {
      const res = await fetch("/api/reports", { cache: "no-store", headers: { "x-ss-shop": ELTON_ID } });
      const data = await res.json() as { reports?: Report[]; error?: string };
      if (!res.ok) throw new Error(data.error || "読込失敗");
      setReports(data.reports || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "読込失敗");
    } finally { setBusy(false); }
  }, [ok]);

  useEffect(() => { void load(); }, [load]);

  return (
    <main className="wrap">
      <h1>報告 inbox</h1>
      <p className="hint">{ok ? "ヘルプからの報告。ショップ管理は各 /s/…/admin。" : "非公開です。"}</p>
      {ok && err ? <p className="err">{err}</p> : null}
      {ok && busy && !reports.length ? <p className="hint">読込中…</p> : null}
      {ok && !busy && !reports.length ? <p className="hint">まだ報告はありません。</p> : null}
      {ok ? <ul className="timeline">{reports.map((r) => (
        <li key={r.id}>
          <article className="tl-card" style={{ cursor: "default" }}>
            {r.title ? <span className="tl-when">{r.title}</span> : null}
            <span className="tl-sum" style={{ whiteSpace: "pre-wrap" }}>{r.body}</span>
            <span className="hint" style={{ marginTop: 6, display: "block" }}>
              {new Date(r.createdAt).toLocaleString("ja-JP")}
              {r.name ? ` · ${r.name}` : ""}
              {r.shopId ? ` · shop ${r.shopId}` : ""}
              {r.path ? ` · ${r.path}` : ""}
            </span>
          </article>
        </li>
      ))}</ul> : null}
    </main>
  );
}
