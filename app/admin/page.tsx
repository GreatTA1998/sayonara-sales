"use client";
import { useCallback, useEffect, useState } from "react";
import type { Report } from "@/lib/report-types";
import "@/components/photo-layout.css";

export default function ReportInbox() {
  const [reports, setReports] = useState<Report[]>([]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(true);

  const load = useCallback(async () => {
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

  useEffect(() => { void load(); }, [load]);

  return (
    <main className="wrap">
      <h1>報告 inbox</h1>
      <p className="hint">ヘルプからの報告。ショップ管理は各 /s/…/admin。</p>
      {err ? <p className="err">{err}</p> : null}
      {busy && !reports.length ? <p className="hint">読込中…</p> : null}
      {!busy && !reports.length ? <p className="hint">まだ報告はありません。</p> : null}
      <ul className="timeline">{reports.map((r) => (
        <li key={r.id}>
          <article className="tl-card" style={{ cursor: "default" }}>
            {r.title ? <span className="tl-when">{r.title}</span> : null}
            <span className="tl-sum" style={{ whiteSpace: "pre-wrap" }}>{r.body}</span>
            {r.screenshotUrl ? <a className="help-shot-link" href={r.screenshotUrl} target="_blank" rel="noreferrer"><img src={r.screenshotUrl} alt="" /></a> : null}
            <span className="hint" style={{ marginTop: 6, display: "block" }}>
              {new Date(r.createdAt).toLocaleString("ja-JP")}
              {r.name ? ` · ${r.name}` : ""}
              {r.shopId ? ` · shop ${r.shopId}` : ""}
              {r.path ? ` · ${r.path}` : ""}
              {r.autofix ? ` · autofix:${r.autofix}` : ""}
            </span>
          </article>
        </li>
      ))}</ul>
    </main>
  );
}
