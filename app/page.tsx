"use client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import ShopBuyerView from "@/components/buyer-ui";
import { Snack, useSnack } from "@/components/snack";
import { peekShop } from "@/lib/live";
import {
  AUTH_EVT, ELTON_ID, ELTON_LABEL, adminPath, ensureShopId, listSales, type SaleRow,
} from "@/lib/shop";
import { SITE_URL } from "@/lib/site";

type Card = SaleRow & { count: number };

export default function HomePage() {
  const router = useRouter();
  const [cards, setCards] = useState<Card[]>([]);
  const [selected, setSelected] = useState<string>(ELTON_ID);
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
  const copyUrl = (e: { stopPropagation(): void }) => {
    e.stopPropagation();
    const url = `${SITE_URL}/s/${shopId}`;
    void navigator.clipboard?.writeText(url).catch(() => undefined);
    show(`コピーしました\n${url}`, "ok");
  };

  return (
    <main className="home">
      <h1 className="slogan">非公式ジモティーお助けツール</h1>
      <p className="subhero">受付中かどうかをリアルタイムで確認して受け渡し日時を予約、あとはジモティーで連絡して取引完了</p>
      <button type="button" className="cta home-cta"
        onClick={() => router.push(adminPath(ensureShopId()))}>投稿</button>
      <div className="home-browse">
        <div className="shop-tabs" role="tablist" aria-label="ショップ一覧">
          {cards.length ? cards.map((c) => (
            <button key={c.id} type="button" role="tab"
              className={`shop-tab${selected === c.id ? " on" : ""}`}
              aria-selected={selected === c.id}
              onClick={() => setSelected(c.id)}>
              {c.count}点 {c.ward}
              {c.id === shopId && (
                <span className="share" onClick={copyUrl}>URLコピー</span>
              )}
            </button>
          )) : (
            <span className="shop-tab ph on">読み込み中…
              <span className="share" onClick={copyUrl}>URLコピー</span>
            </span>
          )}
        </div>
        <div className="home-shop">
          <ShopBuyerView key={shopId} shop={shopId} name={active?.name || ELTON_LABEL} embed />
        </div>
      </div>
      <footer className="soft-promo hint">Made by エルトン</footer>
      <Snack snack={snack} />
    </main>
  );
}
