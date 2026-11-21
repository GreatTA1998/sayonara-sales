"use client";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { byPrice, Listings, ListingTools, money, useDense, usePriceDir } from "@/components/photo-listing";
import { Snack, useSnack } from "@/components/snack";
import { dayLbl, pickupSpan } from "@/lib/days";
import { applyLineSession, getName, openShop, subscribeAuth } from "@/lib/shop";
import { telHref, ytUrl } from "@/lib/sale";
import { SITE_URL } from "@/lib/site";

type Item = {
  id: string; name: string; price: number | null; note?: string; taken: boolean;
  photos?: string[];
};
type State = {
  address: string; bio?: string; jimotyUrl?: string; youtubeUrl?: string;
  days: string[]; slots: string[]; taken: Record<string, string[]>;
  lineInviteUrl?: string | null; phone?: string | null; items: Item[];
};
type Receipt = {
  code: string; day: string; slot: string; address: string; items: string[];
  total?: number; contact?: string; contactMethod?: string;
};
type Method = "line" | "phone";
type Props = { shop: string; name: string; /** Flatten padding when embedded on home. */ embed?: boolean };

const api = (shop: string, path: string) => `${path}?shop=${encodeURIComponent(shop)}`;
const wlKey = (shop: string) => `ss-wl-${shop}`;
const loadWl = (shop: string) => {
  try { return new Set(JSON.parse(localStorage.getItem(wlKey(shop)) || "[]") as string[]); }
  catch { return new Set<string>(); }
};

export default function ShopBuyerView({ shop, name, embed }: Props) {
  const [state, setState] = useState<State | null>(null);
  const [day, setDay] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<Item | null>(null);
  const [checkout, setCheckout] = useState(false);
  const [slot, setSlot] = useState<string | null>(null);
  const [method, setMethod] = useState<Method | null>(null);
  const [lineName, setLineName] = useState("");
  const knownName = useSyncExternalStore(subscribeAuth, getName, () => "");
  const [lineOk, setLineOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [waited, setWaited] = useState<Set<string>>(new Set());
  const [priceDir, setPriceDir] = usePriceDir();
  const [dense, setDense] = useDense();
  const { snack, show } = useSnack();
  const maskPtr = useRef(false);
  const lineUrl = (state?.lineInviteUrl || "").trim();
  const phoneDisp = (state?.phone || "").trim();
  const canLine = !!lineUrl;
  const canPhone = !!phoneDisp;
  const barDates = pickupSpan(state?.days || []);
  const shareUrl = `${SITE_URL}/s/${shop}`;
  const loggedIn = !!knownName;

  const load = useCallback(async () => {
    const data = (await fetch(api(shop, "/api/state"), { cache: "no-store" }).then((r) => r.json())) as State;
    setState(data);
    setDay((d) => d && data.days?.includes(d) ? d : (data.days?.[0] || ""));
  }, [shop]);
  useEffect(() => {
    void load();
    setWaited(loadWl(shop));
    const n = getName();
    if (n) setLineName(n);
    else void applyLineSession().then((s) => { if (s?.name) setLineName(s.name); });
  }, [load, shop]);
  useEffect(() => {
    if (!open && !checkout) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      if (checkout) setCheckout(false);
      else { maskPtr.current = false; setOpen(null); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, checkout]);

  const freeSlots = (state?.slots || []).filter((s) => !(state?.taken?.[day] || []).includes(s));
  useEffect(() => {
    if (slot && (!(state?.slots || []).includes(slot) || (state?.taken?.[day] || []).includes(slot))) setSlot(null);
  }, [state, day, slot]);
  const gridItems = [...(state?.items || [])].sort(byPrice(priceDir));
  const pickedItems = (state?.items || []).filter((i) => picked.has(i.id) && !i.taken);
  const canSend = !!slot && !!method && !!lineName.trim() && pickedItems.length > 0
    && ((method === "line" && canLine && lineOk) || (method === "phone" && canPhone));

  function toggle(id: string) {
    const it = state?.items.find((i) => i.id === id);
    if (!it || it.taken) return;
    setPicked((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  function joinWait(id: string) {
    const n = (getName() || lineName).trim();
    if (!n) { setErr("LINE名を入力してください"); return; }
    openShop(n); setLineName(n); setErr(null);
    setWaited((prev) => {
      const next = new Set(prev); next.add(id);
      localStorage.setItem(wlKey(shop), JSON.stringify([...next]));
      return next;
    });
    setOpen(null);
  }

  function swallowGhostClick() {
    const stop = (ev: Event) => { ev.preventDefault(); ev.stopPropagation(); };
    document.addEventListener("click", stop, true);
    document.addEventListener("pointerup", stop, true);
    window.setTimeout(() => {
      document.removeEventListener("click", stop, true);
      document.removeEventListener("pointerup", stop, true);
    }, 400);
  }

  function closeDetail() {
    maskPtr.current = false;
    setOpen(null);
  }

  function copyShare() {
    void navigator.clipboard?.writeText(shareUrl).catch(() => undefined);
    show(`コピーしました\n${shareUrl}`, "ok");
  }

  async function book() {
    const name = lineName.trim();
    const itemIds = pickedItems.map((i) => i.id);
    if (!itemIds.length || !slot || !method || !name || busy || (method === "line" && !lineOk)) return;
    setBusy(true); setErr(null);
    try {
      const res = await fetch(api(shop, "/api/book"), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          day, slot, itemIds, contactMethod: method, contact: name,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "失敗しました");
      openShop(name);
      setCheckout(false); setOpen(null); setReceipt({ ...data, contactMethod: method });
      setPicked(new Set()); setSlot(null); setMethod(null); setLineOk(false);
      await load();
    } catch (e) { setErr(e instanceof Error ? e.message : "失敗しました"); await load(); }
    finally { setBusy(false); }
  }

  if (receipt) {
    const viaLine = (receipt.contactMethod || method) === "line";
    return (
      <main className="wrap">
        <h1>依頼を送信しました</h1>
        <p className="hint">{name}に送信済み（未確定）。来る前に確認を待ってください。</p>
        <p>コード: <b>{receipt.code}</b></p>
        <p>日付: {dayLbl(receipt.day)}</p>
        <p>時間: {receipt.slot}</p>
        <p>現金合計: {money(receipt.total ?? 0)}</p>
        <p>エリア: {receipt.address}</p>
        {receipt.contact ? <p>LINE名: {receipt.contact}</p> : null}
        <ul>{receipt.items.map((n) => <li key={n}>{n}</li>)}</ul>
        <section className="field">
          <span>{viaLine ? "連絡：LINE（未追加なら招待リンク）" : "連絡：電話"}</span>
          {viaLine && lineUrl
            ? <a className="linelink" href={lineUrl} target="_blank" rel="noopener noreferrer">LINE招待リンク</a>
            : null}
          {!viaLine && phoneDisp
            ? <a className="linelink" href={telHref(phoneDisp)}>{phoneDisp}</a>
            : null}
        </section>
        <button type="button" className="dark" onClick={() => setReceipt(null)}>一覧に戻る</button>
      </main>
    );
  }

  const takenOpen = !!open?.taken;
  const onOpen = open ? picked.has(open.id) : false;
  const waiting = open ? waited.has(open.id) : false;
  const openPics = open?.photos || [];
  const needWlName = takenOpen && !waiting && !(getName() || lineName).trim();
  const yt = (state?.youtubeUrl || "").trim() || ytUrl(state?.bio || "");
  const bioShow = yt && state?.bio
    ? state.bio.replace(yt, "").replace(/[：:]\s*$/m, "").trimEnd()
    : state?.bio;

  return (
    <main className={`buy${embed ? " embed" : ""}`}>
      <header className="bar">
        <span className="area">{(state?.address || "").trim() || "区"}</span>
        <span className="span">{barDates}</span>
        <button type="button" className="share" onClick={copyShare}>
          URLコピー
        </button>
        <button type="button" className="req"
          onClick={() => {
            const n = getName();
            if (n) setLineName(n);
            setOpen(null); setSlot(null);
            setMethod(canLine ? "line" : canPhone ? "phone" : "line");
            setLineOk(false); setErr(null); setCheckout(true);
          }}>
          {pickedItems.length ? `引き取りを依頼 (${pickedItems.length})` : "引き取りを依頼"}
        </button>
      </header>
      {bioShow ? <p className="hint bio">{bioShow}</p> : null}
      <p className="ext-links">
        <span className="hint">{name}</span>
        {state?.jimotyUrl && (
          <a className="ext-link" href={state.jimotyUrl} target="_blank" rel="noopener noreferrer">
            <img className="ext-ico" src="/jimoty.png" alt="" />Jimoty profile
          </a>
        )}
        {yt && (
          <a className="ext-link" href={yt} target="_blank" rel="noopener noreferrer">
            <img className="ext-ico" src="/youtube.svg" alt="" />内見動画
          </a>
        )}
      </p>
      {err && !checkout && !open && <div className="err">{err}</div>}
      {gridItems.length > 0 && (
        <ListingTools dir={priceDir} onDir={setPriceDir} dense={dense} onDense={setDense} />
      )}
      <Listings items={gridItems} dense={dense} onSelect={(it) => { setErr(null); setOpen(it); }}
        classNameFor={(item) => `${picked.has(item.id) ? "on" : ""}${item.taken ? " sold" : ""}`.trim()} />
      {!state && <p className="text-sm text-muted pad">読み込み中…</p>}
      {open && !checkout && (
        <div className="mask drawer" role="dialog" aria-modal="true" aria-label={open.name}
          onPointerDownCapture={(e) => {
            if (e.target !== e.currentTarget) { maskPtr.current = false; return; }
            e.stopPropagation();
            maskPtr.current = true;
          }}
          onPointerUpCapture={(e) => {
            if (e.target !== e.currentTarget) return;
            e.stopPropagation();
            if (!maskPtr.current) return;
            const sel = typeof window !== "undefined" ? window.getSelection()?.toString() : "";
            if (sel) return;
            swallowGhostClick();
            closeDetail();
          }}
          onClickCapture={(e) => {
            if (e.target !== e.currentTarget) return;
            e.stopPropagation();
            e.preventDefault();
          }}>
          <div className="sheet drawer" onClick={(e) => e.stopPropagation()}>
            {openPics.length > 0 && <div className="pics">{openPics.map((src) => <img key={src} src={src} alt="" loading="lazy" decoding="async" />)}</div>}
            <div className="sp">{money(open.price)}</div>
            <h2>{open.name}</h2>
            {open.note ? <p className="sn">{open.note}</p> : null}
            {takenOpen ? (
              <>
                <p className="sw sold">予約済 — 他の方が引き取り予定</p>
                {needWlName && (
                  <label className="float"><span>LINE名</span>
                    <input value={lineName} onChange={(e) => setLineName(e.target.value)}
                      placeholder="表示名" autoComplete="nickname" enterKeyHint="done" /></label>
                )}
                {err && <div className="err">{err}</div>}
                <button type="button" className={`cta${waiting ? " soft" : " go"}`} disabled={waiting}
                  onClick={() => joinWait(open.id)}>
                  {waiting ? "キャンセル待ち中" : "キャンセル待ち"}
                </button>
              </>
            ) : (
              <button type="button" className={`cta${onOpen ? " soft" : " go"}`}
                onClick={() => { toggle(open.id); closeDetail(); }}>{onOpen ? "外す" : "追加"}</button>
            )}
          </div>
        </div>
      )}
      {checkout && (
        <div className="mask" role="dialog" aria-modal="true" aria-label="引き取り日程"
          onClick={() => { setCheckout(false); setErr(null); }}>
          <div className="sheet checkout" onClick={(e) => e.stopPropagation()}>
            <h2>引き取り日程</h2>
            <div className="when">
              <select value={day} aria-label="日付" onChange={(e) => {
                setDay(e.target.value); setSlot(null);
              }}>
                {(state?.days || []).map((d) => <option key={d} value={d}>{dayLbl(d)}</option>)}
              </select>
              <div className="slots trio" role="group" aria-label="時間帯">
                {freeSlots.map((s) => (
                  <button key={s} type="button"
                    className={slot === s ? "slot on" : "slot"}
                    onClick={() => setSlot(s)}>{s}</button>
                ))}
              </div>
            </div>
            {!((state?.days || []).length) ? <p className="sw">予約できる日がありません。</p>
              : !freeSlots.length ? <p className="sw">この日は空きがありません。</p> : null}
            <p className="total">現金合計 {money(pickedItems.reduce((n, i) => n + (i.price ?? 0), 0))}</p>
            <ul className="claim-items">{pickedItems.map((i) => (
              <li key={i.id}><span>{i.name?.trim() || "無題"}</span><span>{money(i.price)}</span></li>
            ))}</ul>
            <div className="field"><span>連絡方法</span>
              {(canLine || canPhone) && (
                <div className="slots pair">
                  {canLine && (
                    <button type="button" className={method === "line" ? "slot on" : "slot"}
                      onClick={() => { setMethod("line"); setLineOk(false); }}>LINE</button>
                  )}
                  {canPhone && (
                    <button type="button" className={method === "phone" ? "slot on" : "slot"}
                      onClick={() => setMethod("phone")}>電話</button>
                  )}
                </div>
              )}
              {method === "line" && canLine && <div className="linebox">
                <a className="linelink" href={lineUrl} target="_blank" rel="noopener noreferrer">LINE招待リンク</a>
                <label className="late-check"><input type="checkbox" checked={lineOk}
                  onChange={(e) => setLineOk(e.target.checked)} />LINEで友だち追加しました</label>
              </div>}
              {method === "phone" && canPhone && (
                <a className="linelink" href={telHref(phoneDisp)}>{phoneDisp}</a>
              )}
              {!canLine && !canPhone && (
                <p className="sw">出品者の連絡先が未設定です。しばらくしてから再度お試しください。</p>
              )}
            </div>
            {!loggedIn && (
              <label className="float"><span>LINE名</span>
                <input value={lineName} onChange={(e) => setLineName(e.target.value)}
                  placeholder="表示名" autoComplete="nickname" enterKeyHint="done" /></label>
            )}
            {err && <div className="err">{err}</div>}
            <button type="button" className={`cta${canSend ? " go" : ""}`} disabled={busy || !canSend}
              onClick={book}>{busy ? "送信中…" : "依頼を送信"}</button>
          </div>
        </div>
      )}
      <Snack snack={snack} />
    </main>
  );
}
