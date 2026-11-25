"use client";
import { useState } from "react";
import { CLAIM_KEY, LineLoginLink } from "@/components/line-oauth";
import { Seg } from "@/components/photo-listing";
import { t, useLang } from "@/lib/lang";
import { softLogin } from "@/lib/shop";

type Mode = "jimoty" | "line" | "facebook";

/** Seg ジモティー名|LINE名|Facebook名 (one field); hard LINE optional below. */
export function SoftLoginForm({
  className, autoFocus, onDone, claimShopId,
}: {
  className?: string; autoFocus?: boolean; onDone?: (id: string) => void;
  /** When set, LINE OAuth return resumes claim for this shop (explicit Claim → login). */
  claimShopId?: string;
}) {
  const lang = useLang();
  const [mode, setMode] = useState<Mode>("facebook");
  const [names, setNames] = useState({ jimoty: "", line: "", facebook: "" });
  const [err, setErr] = useState("");
  const ok = Object.values(names).some((v) => v.trim());
  const label = t(`login.${mode}`, lang);
  return (
    <form className={className} {...(className?.includes("pane")
      ? { role: "dialog" as const, "aria-label": t("login.aria", lang) } : {})}
      onSubmit={(e) => {
        e.preventDefault();
        if (!ok) return;
        const id = softLogin(names.jimoty, names.line, names.facebook);
        if (id === null) {
          setErr(t("login.lineNeed", lang));
          return;
        }
        setErr(""); setNames({ jimoty: "", line: "", facebook: "" });
        onDone?.(id);
      }}>
      <Seg label={t("login.seg", lang)} value={mode} onPick={(v) => setMode(v as Mode)}
        opts={[["jimoty", t("login.jimoty", lang)], ["line", t("login.line", lang)],
          ["facebook", t("login.facebook", lang)]]} />
      <input value={names[mode]}
        onChange={(e) => setNames((n) => ({ ...n, [mode]: e.target.value }))}
        placeholder={label} autoComplete="nickname" autoFocus={autoFocus} />
      <button type="submit" className="cta go" disabled={!ok}>{t("login.signIn", lang)}</button>
      {err ? <p className="sw">{err}</p> : null}
      <LineLoginLink onNavigate={claimShopId ? () => {
        try { sessionStorage.setItem(CLAIM_KEY, claimShopId); } catch { /* ignore */ }
      } : undefined} />
      <p className="hint">{t("login.hint", lang)}</p>
    </form>
  );
}
