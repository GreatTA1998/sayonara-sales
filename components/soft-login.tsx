"use client";
import { useEffect, useState } from "react";
import { LineLoginLink } from "@/components/line-oauth";
import { Seg } from "@/components/photo-listing";
import { setLogin, softLogin } from "@/lib/shop";

/** Seg ジモティー名|LINE名 (one field); hard LINE optional below. slot = outside-click root. */
export function SoftLoginForm({
  className, autoFocus, onDone, slot,
}: { className?: string; autoFocus?: boolean; onDone?: (id: string) => void; slot?: string }) {
  const [mode, setMode] = useState<"jimoty" | "line">("jimoty");
  const [jimoty, setJimoty] = useState("");
  const [line, setLine] = useState("");
  const [err, setErr] = useState("");
  const ok = !!(jimoty.trim() || line.trim());
  useEffect(() => {
    if (!slot) return;
    const close = (e: PointerEvent) => {
      if (!(e.target as Element).closest(slot)) setLogin("");
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [slot]);
  return (
    <form className={className} {...(className?.includes("pane")
      ? { role: "dialog" as const, "aria-label": "ログイン" } : {})}
      onSubmit={(e) => {
        e.preventDefault();
        if (!ok) return;
        const id = softLogin(jimoty, line);
        if (id === null) {
          setErr("このアカウントはLINEログインが必要です");
          return;
        }
        setErr(""); setJimoty(""); setLine("");
        if (slot) setLogin("");
        onDone?.(id);
      }}>
      <Seg label="ソフトログイン" value={mode} onPick={(v) => setMode(v as "jimoty" | "line")}
        opts={[["jimoty", "ジモティー名"], ["line", "LINE名"]]} />
      <input value={mode === "jimoty" ? jimoty : line}
        onChange={(e) => (mode === "jimoty" ? setJimoty : setLine)(e.target.value)}
        placeholder={mode === "jimoty" ? "ジモティー名" : "LINE名"}
        autoComplete="nickname" autoFocus={autoFocus} />
      <button type="submit" className="cta go" disabled={!ok}>サインイン</button>
      {err ? <p className="sw">{err}</p> : <p className="hint">任意：あとでLINEでアカウントを保護できます</p>}
      <LineLoginLink />
    </form>
  );
}
