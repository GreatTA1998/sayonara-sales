"use client";
import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { LineLoginLink } from "@/components/line-oauth";
import { Seg } from "@/components/photo-listing";
import { SoftLoginForm } from "@/components/soft-login";
import { dayLbl } from "@/lib/days";
import { getSavedLang, langLabel, offerLang, setLang, t, useLang } from "@/lib/lang";
import { fetchBuyHistory } from "@/lib/live";
import {
  getFacebookName, getJimotyName, getLineName, getLineUid, getName, logout, subscribeAuth,
  type BuyRow,
} from "@/lib/shop";
import { slotTime } from "@/lib/store";

const pts = (names: (string | undefined | null)[]) => {
  const n = names.map((x) => x?.trim() || "無題");
  return n.length <= 1 ? `1点 · ${n[0] || "無題"}` : `${n.length}点 · ${n[0]}…`;
};

/** Account page body — same content in `/me` and the AppNav account pane. */
export function AccountView({
  onAfterLogout, onLoginDone, onNav,
}: {
  onAfterLogout?: () => void;
  onLoginDone?: (id: string) => void;
  onNav?: () => void;
}) {
  const name = useSyncExternalStore(subscribeAuth, getName, () => "");
  const hard = useSyncExternalStore(subscribeAuth, getLineUid, () => "");
  const jimoty = useSyncExternalStore(subscribeAuth, getJimotyName, () => "");
  const line = useSyncExternalStore(subscribeAuth, getLineName, () => "");
  const facebook = useSyncExternalStore(subscribeAuth, getFacebookName, () => "");
  const lang = useLang();
  const [buys, setBuys] = useState<BuyRow[] | null>(null);
  useEffect(() => {
    let dead = false;
    setBuys(null);
    const sync = () => {
      void fetchBuyHistory().then((rows) => { if (!dead) setBuys(rows); });
    };
    sync();
    const unsub = subscribeAuth(sync);
    return () => { dead = true; unsub(); };
  }, [name, hard, jimoty, line, facebook]);

  const rawOffer = offerLang();
  const offer = rawOffer === "ja" ? "en" : rawOffer;
  const cur = getSavedLang() || "ja";
  const langVal = cur === "ja" ? "ja" : offer;

  if (buys === null) {
    return (
      <div className="account-view" aria-busy="true">
        <p className="av-load">{t("home.loading", lang)}</p>
      </div>
    );
  }

  return (
    <div className="account-view ready">
      <h1>{name || t("me.title", lang)}</h1>
      {!name && !hard ? (
        <SoftLoginForm onDone={(id) => onLoginDone?.(id)} />
      ) : (
        <>
          {hard ? (
            <>
              <p className="hint">{t("me.lineSecure", lang)}</p>
              <dl className="id-view">
                <div><dt>{t("me.lineName", lang)}</dt><dd>{line || name || "—"}</dd></div>
                <div><dt>{t("me.jimotyName", lang)}</dt><dd>{jimoty || "—"}</dd></div>
                <div><dt>{t("me.facebookName", lang)}</dt><dd>{facebook || "—"}</dd></div>
              </dl>
            </>
          ) : (
            <>
              <p className="hint">{t("me.lineLater", lang)}</p>
              <LineLoginLink />
            </>
          )}
          <button type="button" className="cta soft" onClick={() => { void logout(); onAfterLogout?.(); }}>{t("me.logout", lang)}</button>
        </>
      )}
      <section className="lang-set">
        <div className="claims-h">{t("me.lang", lang)}</div>
        <Seg label={t("me.lang", lang)} value={langVal} onPick={setLang}
          opts={[["ja", t("lang.ja", lang)], [offer, langLabel(offer, lang)]]} />
      </section>
      <section className="claims">
        <div className="claims-h">{t("me.buys", lang)}</div>
        {buys.length ? (
          <ul className="timeline">{buys.map((b) => (
            <li key={b.at}>
              <Link className="tl-card" href={`/s/${b.shop}`} prefetch onClick={onNav}>
                <b className="tl-when">{[dayLbl(b.day), slotTime(b.slot)].filter(Boolean).join(" ")}</b>
                <span className="tl-sum">{pts(b.items)}</span>
              </Link>
            </li>
          ))}</ul>
        ) : null}
      </section>
    </div>
  );
}
