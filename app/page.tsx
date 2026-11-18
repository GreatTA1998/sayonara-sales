"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import AdminUi from "@/components/admin-ui";
import { Listings, type PhotoItem } from "@/components/photo-listing";
import {
  DEFAULT_WARD, ELTON_LABEL, WARDS, ensureShopId, getName, listSales, listWardPins,
  openShop, type SaleRow,
} from "@/lib/shop";

const HubMap = dynamic(() => import("@/components/hub-map"), { ssr: false, loading: () => <div className="hub-map ph" /> });

type Tab = "buy" | "sell";
type EltonItem = PhotoItem & { taken?: boolean };

export default function HubPage() {
  const [tab, setTab] = useState<Tab>("buy");
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [selected, setSelected] = useState<SaleRow | null>(null);
  const [elton, setElton] = useState<EltonItem[]>([]);
  const [shopId, setShopId] = useState("");
  const [lineSaved, setLineSaved] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [lineName, setLineName] = useState("");
  const [adminName, setAdminName] = useState("出品");

  const refreshSales = useCallback(() => setSales(listSales()), []);
  useEffect(() => { refreshSales(); }, [refreshSales]);

  useEffect(() => {
    void fetch("/api/state?shop=elton", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setElton((d.items || []) as EltonItem[]))
      .catch(() => setElton([]));
  }, []);

  useEffect(() => {
    if (tab !== "sell") return;
    const id = ensureShopId();
    setShopId(id);
    const n = getName();
    setLineSaved(!!n);
    setAdminName(n || "出品");
    setLineName(n);
  }, [tab]);

  const wardPins = useMemo(
    () => listWardPins(sales, selected?.ward || null),
    [sales, selected],
  );
  const focus = selected ? (WARDS[selected.ward] || WARDS[DEFAULT_WARD]) : null;

  function pickSale(row: SaleRow) {
    setSelected(row);
  }

  function saveLogin(e: { preventDefault(): void }) {
    e.preventDefault();
    const id = openShop(lineName);
    if (!id) return;
    setShopId(id);
    setLineSaved(true);
    setAdminName(lineName.trim());
    setLoginOpen(false);
    refreshSales();
  }

  return (
    <main className={`hub-root${tab === "sell" ? " sell-mode" : ""}`}>
      <div className="wrap hub">
        <h1>Sayonara Sales</h1>
        <div className="hub-tabs" role="tablist" aria-label="買う・売る">
          <button type="button" role="tab" aria-selected={tab === "buy"} className={tab === "buy" ? "on" : ""}
            onClick={() => setTab("buy")}>買う</button>
          <button type="button" role="tab" aria-selected={tab === "sell"} className={tab === "sell" ? "on" : ""}
            onClick={() => setTab("sell")}>売る</button>
        </div>
      </div>

      {tab === "buy" && (
        <section className="hub-buy" role="tabpanel">
          <div className="wrap hub">
            <div className="hub-elton">
              <div className="hub-elton-h">
                <span className="font-bold">{ELTON_LABEL}</span>
                <span className="hint">{DEFAULT_WARD}</span>
                <a className="hub-more" href="/s/elton">もっと見る</a>
              </div>
              <Listings items={elton} onSelect={() => { window.location.href = "/s/elton"; }}
                classNameFor={(it) => (it as EltonItem).taken ? "dim" : ""} />
              {!elton.length && <p className="hint pad">読み込み中…</p>}
            </div>
            <p className="hint">区で探す。リストを選ぶと地図がハイライト。</p>
          </div>
          <HubMap pins={wardPins} focus={focus} selectedWard={selected?.ward || null}
            onWard={(w) => {
              const row = sales.find((s) => s.ward === w);
              if (row) setSelected(row);
            }} />
          <div className="wrap hub">
            <ul className="dir sales">
              {sales.map((s) => (
                <li key={s.id}>
                  <button type="button" className={selected?.id === s.id ? "on" : ""}
                    onClick={() => pickSale(s)}>
                    <span className="font-bold">{s.name}</span>
                    <span className="hint"> · {s.ward}{s.mine ? " · 自分" : ""}</span>
                  </button>
                  <a href={s.href}>見る</a>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {tab === "sell" && shopId && (
        <section className="hub-sell" role="tabpanel">
          <AdminUi shop={shopId} name={adminName}
            login={{ saved: lineSaved, onClick: () => setLoginOpen(true) }} />
          {loginOpen && (
            <div className="mask" role="dialog" aria-modal="true" aria-label="ログインして保存"
              onClick={() => setLoginOpen(false)}>
              <form className="sheet" onClick={(e) => e.stopPropagation()} onSubmit={saveLogin}>
                <h2>ログインして保存</h2>
                <p className="hint">LINE名だけでOK（パスワードなし）</p>
                <label className="float"><span>LINE名</span>
                  <input value={lineName} onChange={(e) => setLineName(e.target.value)}
                    placeholder="表示名" autoComplete="nickname" autoFocus /></label>
                <button type="submit" className="cta go" disabled={!lineName.trim()}>保存</button>
              </form>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
