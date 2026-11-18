"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { listPins, openShop, saveGeo, type Pin } from "@/lib/shop";

const HubMap = dynamic(() => import("@/components/hub-map"), { ssr: false, loading: () => <div className="hub-map ph" /> });

type Tab = "buy" | "sell";

const TIPS = [
  "写真を撮って出品するだけ",
  "まとめて選んで引き取り依頼",
  "LINEの個別やりとりが不要",
];

export default function HubPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("buy");
  const [pins, setPins] = useState<Pin[]>([]);
  const [focus, setFocus] = useState<{ lat: number; lng: number } | null>(null);
  const [near, setNear] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [started, setStarted] = useState(false);
  const [name, setName] = useState("");

  const refresh = useCallback(() => setPins(listPins()), []);
  useEffect(() => { refresh(); }, [refresh]);

  function askNear() {
    if (!navigator.geolocation) { setNear("位置情報が使えません"); return; }
    setBusy(true); setNear(null);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const { latitude: lat, longitude: lng } = p.coords;
        setFocus({ lat, lng });
        const mine = pins.find((x) => x.mine);
        if (mine) { saveGeo(mine.id, lat, lng); refresh(); }
        setNear(null);
        setBusy(false);
      },
      () => { setNear("位置を取得できませんでした"); setBusy(false); },
      { timeout: 8000 },
    );
  }

  function startSell(e: { preventDefault(): void }) {
    e.preventDefault();
    const id = openShop(name);
    if (!id) return;
    refresh();
    router.push(`/s/${id}/admin`);
  }

  return (
    <main className="wrap hub">
      <h1>Sayonara Sales</h1>
      <div className="hub-tabs" role="tablist" aria-label="買う・売る">
        <button type="button" role="tab" aria-selected={tab === "buy"} className={tab === "buy" ? "on" : ""}
          onClick={() => setTab("buy")}>買う</button>
        <button type="button" role="tab" aria-selected={tab === "sell"} className={tab === "sell" ? "on" : ""}
          onClick={() => setTab("sell")}>売る</button>
      </div>

      {tab === "buy" && (
        <section className="hub-buy" role="tabpanel">
          <p className="hint">地図のピンから引き取りへ。戻るときもここから。</p>
          <HubMap pins={pins} focus={focus} onPin={(id) => router.push(`/s/${id}`)} />
          <button type="button" className="ghost" onClick={askNear} disabled={busy}>
            {busy ? "取得中…" : "現在地"}
          </button>
          {near && <p className="hint">{near}</p>}
          {!pins.length && <p className="hint">まだピンがありません。売るタブから出品を始めるとここに出ます。</p>}
          {!!pins.length && (
            <ul className="dir">
              {pins.map((p) => (
                <li key={p.id}>
                  <a href={`/s/${p.id}`}>{p.name}</a>
                  {p.mine ? " · 自分" : ""} · {p.id}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {tab === "sell" && (
        <section className="hub-sell" role="tabpanel">
          <p className="hint">ジモティー風の引越し出品。</p>
          <ul className="tips">{TIPS.map((t) => <li key={t}>{t}</li>)}</ul>
          {!started ? (
            <button type="button" className="dark" onClick={() => setStarted(true)}>出品を始める</button>
          ) : (
            <form className="field" onSubmit={startSell}>
              <label className="float"><span>LINE名</span>
                <input value={name} onChange={(e) => setName(e.target.value)}
                  placeholder="表示名" autoComplete="nickname" autoFocus /></label>
              <button type="submit" className="dark" disabled={!name.trim()}>管理画面へ</button>
            </form>
          )}
        </section>
      )}
    </main>
  );
}
