"use client";
import { useCallback, useEffect, useState } from "react";
import ShopBuyerView from "@/components/buyer-ui";
import { peekShop } from "@/lib/live";
import {
  AUTH_EVT, DEFAULT_WARD, ELTON_ID, ELTON_LABEL, listSales, type SaleRow,
} from "@/lib/shop";

type Card = SaleRow & { count: number };

export default function HomePage() {
  const [cards, setCards] = useState<Card[]>([]);
  const [selected, setSelected] = useState<string>(ELTON_ID);

  const refresh = useCallback(async () => {
    const rows = listSales();
    const enriched = await Promise.all(rows.map(async (r) => {
      try {
        const d = await peekShop(r.id);
        return {
          ...r,
          ward: (d.address || "").trim() || r.ward || DEFAULT_WARD,
          count: d.count,
        } as Card;
      } catch {
        return { ...r, count: 0 } as Card;
      }
    }));
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

  return (
    <main className="home">
      <h1 className="slogan">お引越しセール</h1>
      <p className="subhero">まとめて買って、売って。ジモティの補完に。引っ越しリンクを共有し、まとめて選んで枠で引き取る。確定してからジモティ。</p>
      <div className="home-browse">
        <div className="shop-tabs" role="tablist" aria-label="ショップ一覧">
          {cards.map((c) => (
            <button key={c.id} type="button" role="tab"
              className={`shop-tab${selected === c.id ? " on" : ""}`}
              aria-selected={selected === c.id}
              onClick={() => setSelected(c.id)}>
              {c.count}点 {c.ward}
            </button>
          ))}
          {!cards.length && <span className="shop-tab ph">読み込み中…</span>}
        </div>
        <div className="home-shop">
          <ShopBuyerView key={shopId} shop={shopId} name={active?.name || ELTON_LABEL} embed />
        </div>
      </div>
      <footer className="soft-promo hint">Made by エルトン</footer>
    </main>
  );
}
