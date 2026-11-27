"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { LineLoginLink } from "@/components/line-oauth";
import { Seg } from "@/components/photo-listing";
import { SoftLoginForm } from "@/components/soft-login";
import { Snack, useSnack } from "@/components/snack";
import { dayLbl } from "@/lib/days";
import { getSavedLang, langLabel, offerLang, setLang, t, useLang } from "@/lib/lang";
import { buyerClaimAct, fetchBuyHistory, loadBuyerPickup } from "@/lib/live";
import {
  getFacebookName, getJimotyName, getLineName, getLineUid, getName, logout, subscribeAuth,
  type BuyRow,
} from "@/lib/shop";
import { slotTime } from "@/lib/store";

const pts = (names: (string | undefined | null)[]) => {
  const n = names.map((x) => x?.trim() || "無題");
  return n.length <= 1 ? `1点 · ${n[0] || "無題"}` : `${n.length}点 · ${n[0]}…`;
};
const canAct = (b: BuyRow) => !!b.id && (b.status === "requested" || b.status === "booked");
const rowKey = (b: BuyRow) => b.id || b.at;

/** Account page body — same content in `/me` and the AppNav account pane. */
export function AccountView({
  onAfterLogout, onLoginDone,
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
  const [openKey, setOpenKey] = useState("");
  const [pane, setPane] = useState<"acts" | "resched">("acts");
  const [rsDay, setRsDay] = useState("");
  const [rsSlot, setRsSlot] = useState<string | null>(null);
  const [days, setDays] = useState<string[]>([]);
  const [slots, setSlots] = useState<string[]>([]);
  const [taken, setTaken] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const { snack, show } = useSnack();
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

  const open = (buys || []).find((b) => rowKey(b) === openKey) || null;

  function openRow(b: BuyRow) {
    const k = rowKey(b);
    if (openKey === k) { setOpenKey(""); setPane("acts"); return; }
    setOpenKey(k); setPane("acts"); setDays([]); setSlots([]); setTaken([]);
    setRsDay(b.day || ""); setRsSlot(slotTime(b.slot) || null);
    if (!canAct(b) || !b.id) return;
    void loadBuyerPickup(b.shop, b.id).then((s) => {
      setDays(s.days); setSlots(s.slots);
      const day = b.day && s.days.includes(b.day) ? b.day : (s.days[0] || "");
      setRsDay(day); setRsSlot(slotTime(b.slot) || null);
      setTaken(day ? s.taken(day) : []);
    }).catch(() => undefined);
  }

  async function run(action: "cancel" | "reschedule") {
    if (!open?.id || busy) return;
    setBusy(true);
    try {
      await buyerClaimAct(open.shop, {
        action, id: open.id,
        ...(action === "reschedule" ? { day: rsDay, slot: rsSlot || "" } : {}),
      });
      show(t(action === "cancel" ? "me.cancelOk" : "me.reschedOk", lang), "ok");
      setOpenKey(""); setPane("acts"); setBusy(false);
      void fetchBuyHistory().then(setBuys);
    } catch (e) {
      setBusy(false);
      show(e instanceof Error ? e.message : "失敗しました", "err");
    }
  }

  const rawOffer = offerLang();
  const offer = rawOffer === "ja" ? "en" : rawOffer;
  const cur = getSavedLang() || "ja";
  const langVal = cur === "ja" ? "ja" : offer;
  const rsOpts = rsDay && days.length && !days.includes(rsDay) ? [rsDay, ...days] : days;
  const free = slots.filter((s) => !taken.includes(s) || s === rsSlot);

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
          <ul className="timeline">{buys.map((b) => {
            const on = rowKey(b) === openKey;
            return (
              <li key={rowKey(b)}>
                <button type="button" className={`tl-card${on ? " on" : ""}`} onClick={() => openRow(b)}>
                  <b className="tl-when">{[dayLbl(b.day), slotTime(b.slot)].filter(Boolean).join(" ")}</b>
                  <span className="tl-sum">{pts(b.items)}</span>
                </button>
                {on && open && canAct(open) && pane === "resched" ? (
                  <div className="buy-act" role="group" aria-label={t("me.resched", lang)}>
                    <div className="when">
                      <span className="date-ctl"><select value={rsDay} aria-label={t("me.resched", lang)}
                        onChange={(e) => {
                          const d = e.target.value; setRsDay(d); setRsSlot(null);
                          if (open.id) {
                            void loadBuyerPickup(open.shop, open.id).then((s) => setTaken(s.taken(d)));
                          }
                        }}>
                        {rsOpts.map((d) => <option key={d} value={d}>{dayLbl(d)}</option>)}
                      </select></span>
                      <div className="slots" role="group" aria-label="時間帯">
                        {free.map((s) => (
                          <button key={s} type="button" aria-pressed={rsSlot === s}
                            className={rsSlot === s ? "slot on" : "slot"} onClick={() => setRsSlot(s)}>{s}</button>
                        ))}
                      </div>
                    </div>
                    <button type="button" className={`cta${rsDay && rsSlot ? " go" : ""}`}
                      disabled={busy || !rsDay || !rsSlot}
                      onClick={() => void run("reschedule")}>{t("me.reschedGo", lang)}</button>
                    <button type="button" className="cta soft" disabled={busy}
                      onClick={() => setPane("acts")}>{t("me.back", lang)}</button>
                  </div>
                ) : on && open && canAct(open) ? (
                  <div className="buy-act">
                    <button type="button" className="cta soft" disabled={busy}
                      onClick={() => void run("cancel")}>{t("me.cancel", lang)}</button>
                    <button type="button" className="cta soft" disabled={busy}
                      onClick={() => setPane("resched")}>{t("me.resched", lang)}</button>
                  </div>
                ) : on ? (
                  <p className="hint buy-act">{t("me.buyNoAct", lang)}</p>
                ) : null}
              </li>
            );
          })}</ul>
        ) : null}
      </section>
      <Snack snack={snack} />
    </div>
  );
}
