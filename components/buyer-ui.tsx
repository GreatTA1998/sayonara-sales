"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { byPrice, Listings, ListingTools, money, Seg, useDense, usePriceDir, useShowSold } from "@/components/photo-listing";
import { useBodyScrollLock, useMaskDismiss } from "@/components/snack";
import { dayLbl, moveOutLeft } from "@/lib/days";
import { bookShop, joinWaitLive, listenShop } from "@/lib/live";
import { applyLineSession, getId, getName, openShop, pushBuy, subscribeAuth } from "@/lib/shop";
import {
  bookableDays, cartMeets, cartRule, itemFlags, shopContact, shopSlots, shopSpots, takenSlots,
  type PickupSpot, type Store,
} from "@/lib/store";
import { ytUrl } from "@/lib/sale";

type Item = {
  id: string; name: string; price: number | null; note?: string;
  taken: boolean; sold?: boolean; reqN?: number; when?: string; photos?: string[];
};
type State = {
  address: string; bio?: string; jimotyUrl?: string; youtubeUrl?: string;
  days: string[]; slots: string[]; spots: PickupSpot[]; taken: Record<string, string[]>;
  waiting?: string[];
  moveOut?: string;
  lineInviteUrl?: string | null; phone?: string | null; items: Item[];
  minItems?: number; minTotal?: number; rule?: string | null;
};
type Receipt = { code: string; day: string; slot: string; total?: number; spotName?: string; spotMapsUrl?: string };
type Method = "jimoty" | "line" | "phone";
type Props = { shop: string; name: string; /** Flatten padding when embedded on home. */ embed?: boolean };
const CH = { jimoty: ["ジモティー", "メッセージ済み", "ジモティー名（依頼の識別）"], line: ["LINE", "友だち追加してメッセージ済み", "LINE名"], phone: ["電話", "メッセージ済み", "電話番号"] } as const;

/** Confirmed only — pending is disclaimer + still 依頼可. */
const locked = (i: Item) => i.taken;

function toBuyerState(shop: string, s: Store, account: string): State {
  const days = bookableDays(s);
  const slots = shopSlots(s);
  const contact = shopContact(shop, s);
  const taken: Record<string, string[]> = {};
  for (const d of days) taken[d] = takenSlots(s, d);
  const waiting = account
    ? s.items.filter((it) => {
        const c = s.claims.find((x) => x.id === it.claimId);
        return !!c?.waiters?.some((w) => w.account === account);
      }).map((it) => it.id)
    : [];
  return {
    address: s.address, bio: s.bio || "", jimotyUrl: s.jimotyUrl || "", youtubeUrl: s.youtubeUrl || "",
    days, slots, spots: shopSpots(s), taken, waiting,
    moveOut: s.moveOut || s.pickupTo || "",
    lineInviteUrl: contact.lineInviteUrl || null, phone: contact.phone || null,
    minItems: s.minItems, minTotal: s.minTotal, rule: cartRule(s),
    items: s.items.filter((i) => !i.paused).map((it) => {
      const { id, name, price, note, photos } = it;
      return { id, name, price, note, photos: photos || [], ...itemFlags(s, it) };
    }),
  };
}

export default function ShopBuyerView({ shop, name, embed }: Props) {
  const [state, setState] = useState<State | null>(null);
  const [day, setDay] = useState("");
  const cartKey = `ss-cart-${shop}`;
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [open, setOpen] = useState<Item | null>(null);
  const [checkout, setCheckout] = useState(false);
  const [slot, setSlot] = useState<string | null>(null);
  const [spotId, setSpotId] = useState<string | null>(null);
  const [method, setMethod] = useState<Method | null>(null);
  const [lineName, setLineName] = useState("");
  const knownName = useSyncExternalStore(subscribeAuth, getName, () => "");
  const [chanOk, setChanOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [priceDir, setPriceDir] = usePriceDir();
  const [dense, setDense] = useDense();
  const [showSold, setShowSold] = useShowSold();
  const jimotyUrl = (state?.jimotyUrl || "").trim();
  const lineUrl = (state?.lineInviteUrl || "").trim();
  const canJimoty = !!jimotyUrl;
  const canLine = !!lineUrl;
  // Phone stays hidden (SS-341); Jimoty default when both available.
  const methodOpts = ([["jimoty", canJimoty], ["line", canLine]] as const)
    .filter(([, ok]) => ok).map(([id]) => [id, CH[id][0]] as [Method, string]);
  const barMove = moveOutLeft(state?.moveOut ? [state.moveOut] : []);
  const loggedIn = !!knownName;
  const contactVal = (method === "jimoty" && loggedIn ? knownName : lineName).trim();

  useEffect(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(cartKey) || "[]");
      if (Array.isArray(raw)) setPicked(new Set(raw.map(String)));
    } catch { /* ignore */ }
    const unsub = listenShop(shop, (s) => {
      const next = toBuyerState(shop, s, getId());
      setState(next);
      setOpen((o) => (o ? next.items.find((i) => i.id === o.id) || o : null));
      setDay((d) => (d && next.days?.includes(d) ? d : (next.days?.[0] || "")));
    }, (e) => setErr(e.message || "読み込みに失敗しました"));
    const n = getName();
    if (n) setLineName(n);
    else void applyLineSession().then((s) => { if (s?.name) setLineName(s.name); });
    return unsub;
  }, [shop, cartKey]);
  useBodyScrollLock(!!open || checkout);
  useEffect(() => {
    if (!open && !checkout) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      if (checkout) setCheckout(false);
      else setOpen(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, checkout]);

  const freeSlots = (state?.slots || []).filter((s) => !(state?.taken?.[day] || []).includes(s));
  const spots = state?.spots || [];
  useEffect(() => {
    if (slot && (!(state?.slots || []).includes(slot) || (state?.taken?.[day] || []).includes(slot))) setSlot(null);
  }, [state, day, slot]);
  useEffect(() => {
    if (spotId && !spots.some((s) => s.id === spotId)) setSpotId(null);
    if (!spotId && spots.length === 1) setSpotId(spots[0].id);
  }, [spots, spotId]);
  const gridItems = [...(state?.items || [])].sort(byPrice(priceDir));
  const listItems = showSold ? gridItems : gridItems.filter((i) => !i.sold);
  const pickedItems = (state?.items || []).filter((i) => picked.has(i.id) && !locked(i));
  const waitItems = (state?.items || []).filter((i) => state?.waiting?.includes(i.id));
  const cartTotal = pickedItems.reduce((n, i) => n + (i.price ?? 0), 0);
  const minsOk = !state || cartMeets(state, pickedItems.length, cartTotal);
  const spotOk = !spots.length || !!spotId;
  const canSend = !!slot && spotOk && !!method && !!contactVal && chanOk && pickedItems.length > 0 && minsOk
    && (method === "jimoty" ? canJimoty : canLine);
  const rule = state?.rule || null;

  function toggle(id: string) {
    const it = state?.items.find((i) => i.id === id);
    if (!it || locked(it)) return;
    setPicked((p) => {
      const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id);
      try { localStorage.setItem(cartKey, JSON.stringify([...n])); } catch { /* ignore */ }
      return n;
    });
  }

  async function joinWait(id: string) {
    const n = (getName() || lineName).trim();
    if (!n) { setErr("ジモティー名を入力してください"); return; }
    const account = openShop(n) || n;
    setLineName(n); setErr(null); setBusy(true);
    try {
      await joinWaitLive(shop, id, account);
      setState((prev) => prev && { ...prev, waiting: [...new Set([...(prev.waiting || []), id])] });
      setOpen(null);
    } catch (e) { setErr(e instanceof Error ? e.message : "失敗しました"); }
    finally { setBusy(false); }
  }

  function closeDetail() { setOpen(null); }
  const detailMask = useMaskDismiss(closeDetail);

  async function book() {
    const itemIds = pickedItems.map((i) => i.id);
    if (!itemIds.length || !slot || !method || !contactVal || busy || !canSend || !minsOk) return;
    setBusy(true); setErr(null);
    setState((prev) => prev && {
      ...prev,
      items: prev.items.map((it) => itemIds.includes(it.id) ? { ...it, reqN: (it.reqN || 0) + 1 } : it),
      taken: { ...prev.taken, [day]: [...new Set([...(prev.taken[day] || []), slot])] },
    });
    try {
      const data = await bookShop(shop, {
        day, slot, itemIds, contactMethod: method, contact: contactVal,
        ...(spotId ? { spotId } : {}),
      });
      if (method === "jimoty" || (method === "line" && !loggedIn)) {
        openShop(contactVal, method === "line" ? "line" : "jimoty");
      }
      pushBuy({
        code: String(data.code || ""), shop, day, slot,
        items: Array.isArray(data.items) ? data.items.map(String) : [],
      });
      setCheckout(false); setOpen(null);
      setReceipt({
        code: String(data.code || ""), day, slot, total: data.total,
        ...(data.spotName ? { spotName: String(data.spotName) } : {}),
        ...(data.spotMapsUrl ? { spotMapsUrl: String(data.spotMapsUrl) } : {}),
      });
      setPicked(new Set());
      try { localStorage.removeItem(cartKey); } catch { /* ignore */ }
      setSlot(null); setSpotId(null); setMethod(null); setChanOk(false);
    } catch (e) { setErr(e instanceof Error ? e.message : "失敗しました"); }
    finally { setBusy(false); }
  }

  if (receipt) {
    return (
      <main className="wrap">
        <h1>ありがとう。依頼を受けました</h1>
        <p className="hint">コード {receipt.code} · {dayLbl(receipt.day)} {receipt.slot}{receipt.spotName ? ` · ${receipt.spotName}` : ""} · {money(receipt.total ?? 0)}。選んだ連絡方法で、だいたい2日以内に返事します。履歴は下の名前から。</p>
        {receipt.spotName && receipt.spotMapsUrl ? (
          <p className="hint"><a className="linelink" href={receipt.spotMapsUrl} target="_blank" rel="noopener noreferrer">{receipt.spotName}（Maps）</a></p>
        ) : null}
        <button type="button" className="dark" onClick={() => setReceipt(null)}>一覧に戻る</button>
      </main>
    );
  }

  const soldOpen = !!open?.sold;
  const takenOpen = !!open?.taken && !soldOpen;
  const onOpen = open ? picked.has(open.id) : false;
  const waiting = !!(open && state?.waiting?.includes(open.id));
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
        <span className="span">{barMove}</span>
        <button type="button" className="req"
          onClick={() => {
            const n = getName();
            if (n) setLineName(n);
            setOpen(null); setSlot(null); setSpotId(spots.length === 1 ? spots[0].id : null);
            setMethod(canJimoty ? "jimoty" : canLine ? "line" : null);
            setChanOk(false); setErr(null); setCheckout(true);
          }}>
          {pickedItems.length ? `引き取りを依頼 (${pickedItems.length})` : "引き取りを依頼"}
        </button>
      </header>
      {bioShow ? <p className="hint bio">{bioShow}</p> : null}
      {rule ? <p className="hint rule">{rule}</p> : null}
      {(state?.jimotyUrl || yt) ? (
        <p className="ext-links">
          {state?.jimotyUrl ? (
            <a className="ext-link" href={state.jimotyUrl} target="_blank" rel="noopener noreferrer">
              {name}のジモティープロフィール
            </a>
          ) : null}
          {yt ? (
            <a className="ext-link" href={yt} target="_blank" rel="noopener noreferrer">
              <img className="ext-ico" src="/youtube.svg" alt="" width={16} height={16} />
              内見動画
            </a>
          ) : null}
        </p>
      ) : null}
      {err && !checkout && !open && <div className="err">{err}</div>}
      {gridItems.length > 0 && (
        <ListingTools dir={priceDir} onDir={setPriceDir} dense={dense} onDense={setDense}
          showSold={showSold} onShowSold={setShowSold} />
      )}
      <Listings items={listItems} dense={dense} onSelect={(it) => { setErr(null); setOpen(it); }}
        classNameFor={(item) => `${picked.has(item.id) ? "on" : ""}${item.sold ? " sold" : item.taken ? " booked" : item.reqN ? " req" : ""}`.trim()} />
      {!state && <p className="text-sm text-muted pad">読み込み中…</p>}
      {open && !checkout && (
        <div className="mask drawer" role="dialog" aria-modal="true" aria-label={open.name} {...detailMask}>
          <div className="sheet drawer" onClick={(e) => e.stopPropagation()}>
            {openPics.length > 0 && <div className="pics">{openPics.map((src) => <img key={src} src={src} alt="" loading="lazy" decoding="async" />)}</div>}
            <div className="sp">{money(open.price)}</div>
            <h2>{open.name}</h2>
            {open.note ? <p className="sn">{open.note}</p> : null}
            {soldOpen ? (
              <p className="sw sold">引取済</p>
            ) : takenOpen ? (
              <>
                <p className="sw sold">予約済{open.when ? ` — ${open.when}` : ""}</p>
                {needWlName && (
                  <label className="float"><span>ジモティー名</span>
                    <input value={lineName} onChange={(e) => setLineName(e.target.value)}
                      placeholder="表示名" autoComplete="nickname" enterKeyHint="done" /></label>
                )}
                {err && <div className="err">{err}</div>}
                <button type="button" className={`cta${waiting ? " soft" : " go"}`} disabled={waiting || busy}
                  onClick={() => void joinWait(open.id)}>
                  {waiting ? "キャンセル待ち中" : "キャンセル待ち"}
                </button>
              </>
            ) : (
              <>
                {open.reqN ? <p className="sw">{open.reqN}人依頼中</p> : null}
                <button type="button" className={`cta${onOpen ? " soft" : " go"}`}
                  onClick={() => { toggle(open.id); closeDetail(); }}>
                  {onOpen ? "外す" : open.reqN ? "次に並ぶ" : "追加"}
                </button>
              </>
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
              <span className="date-ctl"><select value={day} aria-label="日付" onChange={(e) => { setDay(e.target.value); setSlot(null); }}>
                {(state?.days || []).map((d) => <option key={d} value={d}>{dayLbl(d)}</option>)}
              </select></span>
              <div className="slots" role="group" aria-label="時間帯">
                {freeSlots.map((s) => (
                  <button key={s} type="button" aria-pressed={slot === s}
                    className={slot === s ? "slot on" : "slot"}
                    onClick={() => setSlot(s)}>{s}</button>
                ))}
              </div>
            </div>
            {!((state?.days || []).length) ? <p className="sw">予約できる日がありません。</p>
              : !freeSlots.length ? <p className="sw">この日は空きがありません。</p> : null}
            {spots.length > 0 && (
              <div className="field"><span>受取場所</span>
                <div className="slots" role="radiogroup" aria-label="受取場所">
                  {spots.map((sp) => (
                    <div key={sp.id} className="spot-opt">
                      <button type="button" role="radio" aria-checked={spotId === sp.id}
                        className={spotId === sp.id ? "slot on" : "slot"}
                        onClick={() => setSpotId(sp.id)}>{sp.name}</button>
                      {sp.mapsUrl ? (
                        <a className="maps" href={sp.mapsUrl} target="_blank" rel="noopener noreferrer">Maps</a>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            )}
            <p className="total">現金合計 {money(cartTotal)}</p>
            <ul className="claim-items">{pickedItems.map((i) => (
              <li key={i.id}><span>{i.name?.trim() || "無題"}</span><span>{money(i.price)}</span></li>
            )).concat(waitItems.map((i) => (
              <li key={i.id}><span>{i.name?.trim() || "無題"} · キャンセル待ち</span><span>{money(i.price)}</span></li>
            )))}</ul>
            {rule ? <p className={minsOk ? "hint" : "sw"}>{rule}{minsOk ? "" : " — まだ足りません"}</p> : null}
            <div className="field contact"><span>連絡方法</span>
              {!methodOpts.length ? (
                <p className="sw">出品者の連絡先が未設定です。しばらくしてから再度お試しください。</p>
              ) : (
                <>
                  {methodOpts.length > 1 && (
                    <Seg label="連絡方法" value={method || ""} onPick={(v) => { setMethod(v as Method); setChanOk(false); }}
                      opts={methodOpts} />
                  )}
                  {method && <>
                    <div className="linebox">
                      <a className="linelink" target="_blank" rel="noopener noreferrer"
                        href={method === "jimoty" ? jimotyUrl : lineUrl}>
                        {method === "jimoty" ? "出品者のジモティー" : "LINE招待リンク"}
                      </a>
                      <label className="late-check"><input type="checkbox" checked={chanOk}
                        onChange={(e) => setChanOk(e.target.checked)} />{CH[method][1]}</label>
                    </div>
                    <p className="hint">{method === "jimoty"
                      ? "ジモティーから来た方は、できればジモティー上で取引を完了してください。"
                      : "ジモティーのアカウントをお持ちでない方向けです。"}</p>
                    {!(loggedIn && method === "jimoty") && (
                      <label className="float"><span>{CH[method][2]}</span>
                        <input value={lineName} onChange={(e) => setLineName(e.target.value)}
                          placeholder="表示名" autoComplete="nickname" enterKeyHint="done" /></label>
                    )}
                  </>}
                </>
              )}
            </div>
            {err && <div className="err">{err}</div>}
            <button type="button" className={`cta${canSend ? " go" : ""}`} disabled={busy || !canSend}
              onClick={book}>{busy ? "送信中…" : "依頼を送信"}</button>
            <p className="hint send-hint">返事までだいたい2日かかることがあります。出品者が依頼のなかから選びます。</p>
          </div>
        </div>
      )}
    </main>
  );
}
