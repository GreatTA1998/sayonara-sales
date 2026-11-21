"use client";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { byPrice, Listings, ListingTools, money, useDense, usePriceDir } from "@/components/photo-listing";
import { Snack, useSnack } from "@/components/snack";
import { dayLbl, pickupSpan } from "@/lib/days";
import { applyLineSession, getName, openShop, pushBuy, subscribeAuth } from "@/lib/shop";
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
type Receipt = { code: string; day: string; slot: string; total?: number };
type Method = "jimoty" | "line" | "phone";
type Props = { shop: string; name: string; /** Flatten padding when embedded on home. */ embed?: boolean };
const CH = { jimoty: ["Jimoty", "ジモティでメッセージしました", "ジモティ名"], line: ["LINE", "LINEで友だち追加しました", "LINE名"], phone: ["電話", "電話しました", "電話番号"] } as const;

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
  const [chanOk, setChanOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [waited, setWaited] = useState<Set<string>>(new Set());
  const [priceDir, setPriceDir] = usePriceDir();
  const [dense, setDense] = useDense();
  const { snack, show } = useSnack();
  const maskPtr = useRef(false);
  const jimotyUrl = (state?.jimotyUrl || "").trim();
  const lineUrl = (state?.lineInviteUrl || "").trim();
  const phoneDisp = (state?.phone || "").trim();
  const canJimoty = !!jimotyUrl, canLine = !!lineUrl, canPhone = !!phoneDisp;
  const barDates = pickupSpan(state?.days || []);
  const shareUrl = `${SITE_URL}/s/${shop}`;
  const loggedIn = !!knownName;
  const contactVal = (method === "jimoty" && loggedIn ? knownName : lineName).trim();

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
  const canSend = !!slot && !!method && !!contactVal && chanOk && pickedItems.length > 0
    && (method === "jimoty" ? canJimoty : method === "line" ? canLine : canPhone);

  function toggle(id: string) {
    const it = state?.items.find((i) => i.id === id);
    if (!it || it.taken) return;
    setPicked((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  function joinWait(id: string) {
    const n = (getName() || lineName).trim();
    if (!n) { setErr("ジモティ名を入力してください"); return; }
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
    const itemIds = pickedItems.map((i) => i.id);
    if (!itemIds.length || !slot || !method || !contactVal || busy || !canSend) return;
    setBusy(true); setErr(null);
    try {
      const res = await fetch(api(shop, "/api/book"), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          day, slot, itemIds, contactMethod: method, contact: contactVal,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "失敗しました");
      if (method === "jimoty" || (method === "line" && !loggedIn)) openShop(contactVal);
      pushBuy({
        code: String(data.code || ""), shop, day, slot,
        items: Array.isArray(data.items) ? data.items.map(String) : [],
      });
      setCheckout(false); setOpen(null);
      setReceipt({ code: String(data.code || ""), day, slot, total: data.total });
      setPicked(new Set()); setSlot(null); setMethod(null); setChanOk(false);
      await load();
    } catch (e) { setErr(e instanceof Error ? e.message : "失敗しました"); await load(); }
    finally { setBusy(false); }
  }

  if (receipt) {
    return (
      <main className="wrap">
        <h1>依頼を送信しました</h1>
        <p className="hint">{name}に送信済み（未確定）。コード {receipt.code} · {dayLbl(receipt.day)} {receipt.slot} · {money(receipt.total ?? 0)}</p>
        <p className="hint">履歴はマイページ。来る前に確認を待ってください。</p>
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
            setMethod(canJimoty ? "jimoty" : canLine ? "line" : canPhone ? "phone" : null);
            setChanOk(false); setErr(null); setCheckout(true);
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
                  <label className="float"><span>ジモティ名</span>
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
              {(canJimoty || canLine || canPhone) ? (
                <div className="slots trio">
                  {([["jimoty", canJimoty], ["line", canLine], ["phone", canPhone]] as const)
                    .filter(([, ok]) => ok).map(([id]) => (
                    <button key={id} type="button" className={method === id ? "slot on" : "slot"}
                      onClick={() => { setMethod(id); setChanOk(false); }}>{CH[id][0]}</button>
                  ))}
                </div>
              ) : <p className="sw">出品者の連絡先が未設定です。しばらくしてから再度お試しください。</p>}
              {method && <>
                <div className="linebox">
                  <a className="linelink" target="_blank" rel="noopener noreferrer"
                    href={method === "jimoty" ? jimotyUrl : method === "line" ? lineUrl : telHref(phoneDisp)}>
                    {method === "jimoty" ? "ジモティ" : method === "line" ? "LINE招待リンク" : phoneDisp}
                  </a>
                  <label className="late-check"><input type="checkbox" checked={chanOk}
                    onChange={(e) => setChanOk(e.target.checked)} />{CH[method][1]}</label>
                </div>
                {!(loggedIn && method === "jimoty") && (
                  <label className="float"><span>{CH[method][2]}</span>
                    <input value={lineName} onChange={(e) => setLineName(e.target.value)}
                      placeholder={method === "phone" ? "080-0000-0000" : "表示名"}
                      inputMode={method === "phone" ? "tel" : "text"} autoComplete="nickname"
                      enterKeyHint="done" /></label>
                )}
              </>}
            </div>
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
