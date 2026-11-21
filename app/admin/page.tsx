"use client";
import { useCallback, useEffect, useState } from "react";
import type { Report, ReportType } from "@/lib/report-types";
import "@/components/photo-layout.css";

type Filter = "all" | ReportType;

export default function ReportInbox() {
  const [reports, setReports] = useState<Report[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
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

  const rows = filter === "all" ? reports : reports.filter((r) => r.type === filter);

  return (
    <main className="wrap">
      <h1>報告 inbox</h1>
      <p className="hint">HELP からのバグ・メッセージ。ショップ管理は各 /s/…/admin。</p>
      <div className="seg" role="group" aria-label="種類">
        {([["all", "すべて"], ["bug", "バグ"], ["message", "メッセージ"]] as const).map(([v, label]) => (
          <button key={v} type="button" className={filter === v ? "on" : ""}
            onClick={() => setFilter(v)}>{label}</button>
        ))}
      </div>
      {err && <p className="err">{err}</p>}
      {busy && !rows.length ? <p className="hint">読込中…</p> : null}
      {!busy && !rows.length ? <p className="hint">まだ報告はありません。</p> : null}
      <ul className="timeline">
        {rows.map((r) => (
          <li key={r.id}>
            <article className="tl-card" style={{ cursor: "default" }}>
              <span className="tl-when">
                {r.type === "bug" ? "バグ" : "メッセージ"}
                {r.title ? ` · ${r.title}` : ""}
              </span>
              <span className="tl-sum" style={{ whiteSpace: "pre-wrap" }}>{r.body}</span>
              <span className="hint" style={{ marginTop: 6, display: "block" }}>
                {new Date(r.createdAt).toLocaleString("ja-JP")}
                {r.name ? ` · ${r.name}` : ""}
                {r.shopId ? ` · shop ${r.shopId}` : ""}
                {r.path ? ` · ${r.path}` : ""}
              </span>
            </article>
          </li>
        ))}
      </ul>
    </main>
  );
}
