"use client";
import { useEffect, useState } from "react";
import { useBodyScrollLock } from "@/components/snack";
import { langLabel, offerLang, setLang, t, useNeedSplash } from "@/lib/lang";

/** Non-ja browsers with no ss-lang: pick translate or stay Japanese. */
export default function LangSplash() {
  const need = useNeedSplash();
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const show = ready && need;
  useBodyScrollLock(show);
  if (!show) return null;

  const target = offerLang();
  const name = langLabel(target, target);
  return (
    <div className="mask lang-mask" role="dialog" aria-modal="true" aria-label={t("splash.msg", target, { lang: name })}>
      <div className="sheet lang-splash">
        <h2>{t("splash.msg", target, { lang: name })}</h2>
        <div className="lang-acts">
          <button type="button" className="cta soft" onClick={() => setLang(target)}>
            {t("splash.yes", target, { lang: name })}
          </button>
          <button type="button" className="cta soft" onClick={() => setLang("ja")}>
            {t("splash.stay", target)}
          </button>
        </div>
        <p className="hint">{t("splash.note", target)}</p>
      </div>
    </div>
  );
}
