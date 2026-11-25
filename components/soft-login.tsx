"use client";
import { useState } from "react";
import { LineLoginLink } from "@/components/line-oauth";
import { Seg } from "@/components/photo-listing";
import { t, useLang } from "@/lib/lang";
import { softLogin } from "@/lib/shop";

/** Seg ジモティ名|LINE名 (one field); hard LINE optional below. */
export function SoftLoginForm({
  className, autoFocus, onDone,
}: { className?: string; autoFocus?: boolean; onDone?: (id: string) => void }) {
  const lang = useLang();
  const [mode, setMode] = useState<"jimoty" | "line">("jimoty");
  const [jimoty, setJimoty] = useState("");
  const [line, setLine] = useState("");
  const [err, setErr] = useState("");
  const ok = !!(jimoty.trim() || line.trim());
  return (
    <form className={className} {...(className?.includes("pane")
      ? { role: "dialog" as const, "aria-label": t("login.aria", lang) } : {})}
      onSubmit={(e) => {
        e.preventDefault();
        if (!ok) return;
        const id = softLogin(jimoty, line);
        if (id === null) {
          setErr(t("login.lineNeed", lang));
          return;
        }
        setErr(""); setJimoty(""); setLine("");
        onDone?.(id);
      }}>
      <Seg label={t("login.seg", lang)} value={mode} onPick={(v) => setMode(v as "jimoty" | "line")}
        opts={[["jimoty", t("login.jimoty", lang)], ["line", t("login.line", lang)]]} />
      <input value={mode === "jimoty" ? jimoty : line}
        onChange={(e) => (mode === "jimoty" ? setJimoty : setLine)(e.target.value)}
        placeholder={mode === "jimoty" ? t("login.jimoty", lang) : t("login.line", lang)}
        autoComplete="nickname" autoFocus={autoFocus} />
      <button type="submit" className="cta go" disabled={!ok}>{t("login.signIn", lang)}</button>
      {err ? <p className="sw">{err}</p> : <p className="hint">{t("login.hint", lang)}</p>}
      <LineLoginLink />
    </form>
  );
}
