"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import ShopBuyerView from "@/components/buyer-ui";
import { Snack, useSnack } from "@/components/snack";
import { listPublishedShops } from "@/lib/live";
import { t, useLang } from "@/lib/lang";
import { ELTON_ID } from "@/lib/shop";
import { SITE_URL } from "@/lib/site";

type Card = { id: string; ward: string };

export default function HomePage() {
  const lang = useLang();
  const [cards, setCards] = useState<Card[]>([]);
  const [selected, setSelected] = useState<string>(ELTON_ID);
  const [readyShop, setReadyShop] = useState<string | null>(null);
  const [tabsReady, setTabsReady] = useState(false);
  const { snack, show } = useSnack();

  const refresh = useCallback(async () => {
    try {
      const rows = await Promise.race([
        listPublishedShops(),
        new Promise<Card[]>((_, reject) => setTimeout(() => reject(new Error("timeout")), 8000)),
      ]);
      setCards(rows);
    } catch { setCards([]); }
    finally { setTabsReady(true); }
  }, []);

  // Defer so embedded listenShop wins the cold Firebase connection.
  useEffect(() => {
    let gone = false;
    const run = () => { if (!gone) void refresh(); };
    const t = window.setTimeout(run, 250);
    return () => { gone = true; clearTimeout(t); };
  }, [refresh]);

  const active = cards.find((c) => c.id === selected) || cards[0];
  const shopId = active?.id || ELTON_ID;
  // Sun-ray until both shop-tab nav and selected shop are ready.
  // Tabs may be empty (query error / none published); don't hang the panel on that.
  const panelReady = tabsReady && readyShop !== null;
  const copyUrl = (e: { stopPropagation(): void }) => {
    e.stopPropagation();
    const url = `${SITE_URL}/s/${shopId}`;
    void navigator.clipboard?.writeText(url).catch(() => undefined);
    show(`${t("home.copied", lang)}\n${url}`, "ok");
  };

  return (
    <main className="home">
      <h1 className="slogan">{t("home.slogan", lang)}</h1>
      <p className="hero-prose">{t("home.prose", lang)}</p>
      <div className={`shop-panel${panelReady ? " in" : ""}`} aria-busy={!panelReady} aria-label={panelReady ? undefined : t("home.loading", lang)}>
        <div className="home-browse">
          <div className="shop-tabs" role="tablist" aria-label={t("home.tabs", lang)}>
            {cards.map((c) => (
              <button key={c.id} type="button" role="tab"
                className={`shop-tab${selected === c.id ? " on" : ""}`}
                aria-selected={selected === c.id}
                onClick={() => setSelected(c.id)}>
                {c.ward}
                {c.id === shopId && (
                  <span className="share" onClick={copyUrl}>{t("home.copy", lang)}</span>
                )}
              </button>
            ))}
          </div>
          <div className={`home-shop${readyShop === shopId ? " in" : ""}`}>
            <ShopBuyerView shop={shopId} embed onReady={() => setReadyShop(shopId)} />
          </div>
        </div>
        <footer className="soft-promo hint">
          Made by エルトン
          {" · "}
          <Link href="/privacy">{t("foot.privacy", lang)}</Link>
          {" · "}
          <Link href="/terms">{t("foot.terms", lang)}</Link>
        </footer>
      </div>
      <Snack snack={snack} />
    </main>
  );
}
