"use client";
import { useCallback, useEffect, useState } from "react";
import AppNav from "@/components/app-nav";
import ShopBuyerView from "@/components/buyer-ui";
import {
  DEFAULT_WARD, ELTON_ID, ELTON_LABEL, listSales, type SaleRow,
} from "@/lib/shop";

type Card = SaleRow & { count: number };

export default function HomePage() {
  const [cards, setCards] = useState<Card[]>([]);
  const [selected, setSelected] = useState<string>(ELTON_ID);

  const refresh = useCallback(async () => {
    const rows = listSales();
    const enriched = await Promise.all(rows.map(async (r) => {
      try {
        const d = await fetch(`/api/state?shop=${encodeURIComponent(r.id)}`, { cache: "no-store" }).then((x) => x.json());
        return {
          ...r,
          ward: (d.address || "").trim() || r.ward || DEFAULT_WARD,
          count: Array.isArray(d.items) ? d.items.length : 0,
        } as Card;
      } catch {
        return { ...r, count: 0 } as Card;
      }
    }));
    setCards(enriched);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const active = cards.find((c) => c.id === selected) || cards[0];
  const shopId = active?.id || ELTON_ID;
  const shopName = active?.name || ELTON_LABEL;

  return (
    <main className="home">
      <AppNav top onAuth={() => void refresh()} />
      <p className="slogan">まとめて売って、まとめて買う。</p>

      <div className="home-browse">
        <div className="shop-rail" role="list" aria-label="ショップ一覧">
          {cards.map((c) => (
            <button key={c.id} type="button" role="listitem"
              className={`shop-card${selected === c.id ? " on" : ""}`}
              onClick={() => setSelected(c.id)}>
              <span className="sc-count">{c.count}点</span>
              <span className="sc-ward">{c.ward}</span>
              <span className="sc-name">{c.name}{c.mine ? " · 自分" : ""}</span>
            </button>
          ))}
          {!cards.length && <div className="shop-card ph">読み込み中…</div>}
        </div>

        <div className="home-shop">
          <ShopBuyerView key={shopId} shop={shopId} name={shopName} embed />
        </div>
      </div>
    </main>
  );
}
