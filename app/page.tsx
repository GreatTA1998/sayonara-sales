"use client";
import { useCallback, useEffect, useState } from "react";
import ShopBuyerView from "@/components/buyer-ui";
import { Snack, useSnack } from "@/components/snack";
import { peekShop } from "@/lib/live";
import { t, useLang } from "@/lib/lang";
import {
  AUTH_EVT, ELTON_ID, listSales, type SaleRow,
} from "@/lib/shop";
import { SITE_URL } from "@/lib/site";

type Card = SaleRow & { count: number };

export default function HomePage() {
  const lang = useLang();
  const [cards, setCards] = useState<Card[]>([]);
  const [selected, setSelected] = useState<string>(ELTON_ID);
  const [readyShop, setReadyShop] = useState<string | null>(null);
  const { snack, show } = useSnack();

  const refresh = useCallback(async () => {
    const rows = listSales();
    // Public home = published only (投稿 draft / empty stay private).
    const enriched = (await Promise.all(rows.map(async (r) => {
      try {
        const d = await peekShop(r.id);
        if (r.id !== ELTON_ID && !d.published) return null;
        return {
          ...r,
          ward: (d.address || "").trim() || r.ward,
          count: d.count,
        } as Card;
      } catch {
        return null;
      }
    }))).filter((c): c is Card => !!c);
    setCards(enriched);
  }, []);

  // Defer tab peeks so embedded listenShop wins the cold Firebase connection.
  useEffect(() => {
    let gone = false;
    const run = () => { if (!gone) void refresh(); };
    const t = window.setTimeout(run, 250);
    return () => { gone = true; clearTimeout(t); };
  }, [refresh]);
  useEffect(() => {
    const onAuth = () => { void refresh(); };
    window.addEventListener(AUTH_EVT, onAuth);
    return () => window.removeEventListener(AUTH_EVT, onAuth);
  }, [refresh]);

  const active = cards.find((c) => c.id === selected) || cards[0];
  const shopId = active?.id || ELTON_ID;
  const panelReady = cards.length > 0 && readyShop !== null;
  const onShopReady = useCallback(() => setReadyShop(shopId), [shopId]);
  const copyUrl = (e: { stopPropagation(): void }) => {
    e.stopPropagation();
    const url = `${SITE_URL}/s/${shopId}`;
    void navigator.clipboard?.writeText(url).catch(() => undefined);
    show(`${t("home.copied", lang)}\n${url}`, "ok");
  };

  return (
    <main className="home">
      <h1 className="slogan">{t("home.slogan", lang)}</h1>
      <ul className="hero-bullets">
        {t("home.bullets", lang).split("\n").map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <div className={panelReady ? "shop-panel in" : "shop-panel"} aria-busy={!panelReady}
        aria-hidden={!panelReady}>
        <div className="home-browse">
          <div className="shop-tabs" role="tablist" aria-label={t("home.tabs", lang)}>
            {cards.map((c) => (
              <button key={c.id} type="button" role="tab"
                className={`shop-tab${selected === c.id ? " on" : ""}`}
                aria-selected={selected === c.id}
                onClick={() => setSelected(c.id)}>
                {c.count}点 {c.ward}
                {c.id === shopId && (
                  <span className="share" onClick={copyUrl}>{t("home.copy", lang)}</span>
                )}
              </button>
            ))}
          </div>
          <div className="home-shop">
            <ShopBuyerView key={shopId} shop={shopId} embed onReady={onShopReady} />
          </div>
        </div>
        <footer className="soft-promo hint">Made by エルトン</footer>
      </div>
      <Snack snack={snack} />
    </main>
  );
}
