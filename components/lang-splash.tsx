"use client";
import { useEffect, useState } from "react";
import { useBodyScrollLock } from "@/components/snack";
import {
  detectBrowserLang, langLabel, offerLang, setLang, t, useNeedSplash,
} from "@/lib/lang";

/** Non-ja browsers with no ss-lang: pick translate or stay Japanese. */
export default function LangSplash() {
  const need = useNeedSplash();
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const show = ready && need;
  const detected = detectBrowserLang();
  const target = offerLang(detected);
  const [ui, setUi] = useState(target); // splash toggle JP ↔ detected
  useBodyScrollLock(show);
  if (!show) return null;

  const name = langLabel(target, ui);
  return (
    <div className="mask lang-mask" role="dialog" aria-modal="true" aria-label={t("splash.msg", ui, { lang: name })}>
      <div className="sheet lang-splash">
        <div className="lang-tog" role="group" aria-label={t("me.lang", ui)}>
          <button type="button" className={ui === "ja" ? "on" : undefined}
            aria-pressed={ui === "ja"} onClick={() => setUi("ja")}>{t("lang.ja", ui)}</button>
          <button type="button" className={ui === target ? "on" : undefined}
            aria-pressed={ui === target} onClick={() => setUi(target)}>{langLabel(target, ui)}</button>
        </div>
        <h2>{t("splash.msg", ui, { lang: name })}</h2>
        <button type="button" className="cta go" onClick={() => setLang(target)}>{t("splash.yes", ui)}</button>
        <button type="button" className="cta soft" onClick={() => setLang("ja")}>{t("splash.stay", ui)}</button>
        <p className="hint">{t("splash.note", ui)}</p>
      </div>
    </div>
  );
}
