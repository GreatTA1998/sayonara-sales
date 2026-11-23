"use client";
import { useState } from "react";
import { LineLoginLink } from "@/components/line-oauth";
import { Seg } from "@/components/photo-listing";
import { softLogin } from "@/lib/shop";

/** Seg ジモティ名|LINE名 (one field); hard LINE optional below. */
export function SoftLoginForm({
  className, autoFocus, onDone,
}: { className?: string; autoFocus?: boolean; onDone?: (id: string) => void }) {
  const [mode, setMode] = useState<"jimoty" | "line">("jimoty");
  const [jimoty, setJimoty] = useState("");
  const [line, setLine] = useState("");
  const ok = !!(jimoty.trim() || line.trim());
  return (
    <form className={className} {...(className?.includes("pane")
      ? { role: "dialog" as const, "aria-label": "ログイン" } : {})}
      onSubmit={(e) => {
        e.preventDefault();
        if (!ok) return;
        const id = softLogin(jimoty, line);
        setJimoty(""); setLine("");
        onDone?.(id);
      }}>
      <Seg label="ソフトログイン" value={mode} onPick={(v) => setMode(v as "jimoty" | "line")}
        opts={[["jimoty", "ジモティ名"], ["line", "LINE名"]]} />
      <input value={mode === "jimoty" ? jimoty : line}
        onChange={(e) => (mode === "jimoty" ? setJimoty : setLine)(e.target.value)}
        placeholder={mode === "jimoty" ? "ジモティ名" : "LINE名"}
        autoComplete="nickname" autoFocus={autoFocus} />
      <button type="submit" className="cta go" disabled={!ok}>サインイン</button>
      <p className="hint">任意：あとでLINEでアカウントを保護できます</p>
      <LineLoginLink />
    </form>
  );
}
