"use client";
import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { byPrice, Listings, ListingTools, money, Seg, useDense, usePriceDir, useShowSold } from "@/components/photo-listing";
import { PhotoLightbox } from "@/components/photo-lightbox";
import { useBodyScrollLock, useMaskDismiss } from "@/components/snack";
import { afterLbl, dayLbl, moveOutLeft, tokyoYmd } from "@/lib/days";
import { lineLoginHref, WL_KEY } from "@/components/line-oauth";
import { bookShop, findOwnedShop, joinWaitLive, leaveWaitLive, listenShop } from "@/lib/live";
import { t, useLang } from "@/lib/lang";
import { notifyLine } from "@/lib/notify";
import {
  adminPath, applyLineSession, getId, getLineUid, getName, openShop, pushBuy, subscribeAuth,
} from "@/lib/shop";
import {
  bookableDays, cartAfter, cartDiscount, cartRule, itemFlags, shopContact, shopItemOff,
  shopPublished, shopSlots, slotTime, takenSlots, type Store,
} from "@/lib/store";
import { extHref, telHref, ytUrl } from "@/lib/sale";

type Item = {
  id: string; name: string; price: number | null; note?: string;
  taken: boolean; sold?: boolean; reqN?: number; waitN?: number; when?: string; photos?: string[];
  availableAfter?: string; after?: string;
  /** Booked claim waiter accounts (FIFO) — match leave/join against live identity keys. */
  waitAs?: string[];
};
type State = {
  address: string; bio?: string; jimotyUrl?: string; youtubeUrl?: string; facebookUrl?: string;
  days: string[]; slots: string[]; taken: Record<string, string[]>;
  moveOut?: string;
  lineInviteUrl?: string | null; phone?: string | null; otherUrl?: string;
  items: Item[];
  itemOff?: number; rule?: string | null;
  published?: boolean; ownerUid?: string; ownerLineUid?: string;
};
type Receipt = { day: string; slot: string; total?: number };
type Method = "jimoty" | "line" | "phone" | "facebook" | "other";
type Props = {
  shop: string; /** Flatten padding when embedded on home. */ embed?: boolean;
  onReady?: () => void;
};
const CH = {
  jimoty: ["ジモティー", "メッセージ済み", "ジモティー名（依頼の識別）"],
  line: ["LINE", "友だち追加してメッセージ済み", "LINE名"],
  phone: ["電話", "メッセージ済み", "電話番号"],
  facebook: ["Facebook", "メッセージ済み", "Facebook名"],
  other: ["その他", "メッセージ済み", "お名前"],
} as const;

/** Confirmed only — pending is disclaimer + still 依頼可. */
const locked = (i: Item) => i.taken;
/** dig5 + Jimoty/LINE name + in-sheet draft — snap-time keys alone missed the draft name. */
const mineKeys = (...extra: string[]) =>
  [...new Set([getId(), getName(), ...extra].map((s) => s.trim()).filter(Boolean))];

function toBuyerState(shop: string, s: Store): State {
  const days = bookableDays(s);
  const slots = shopSlots(s);
  const contact = shopContact(shop, s);
  const off = shopItemOff(s);
  const taken: Record<string, string[]> = {};
  for (const d of days) taken[d] = takenSlots(s, d);
  return {
    address: s.address, bio: s.bio || "", jimotyUrl: s.jimotyUrl || "", youtubeUrl: s.youtubeUrl || "",
    facebookUrl: s.facebookUrl || "", otherUrl: s.otherUrl || "",
    days, slots, taken,
    moveOut: s.moveOut || s.pickupTo || "",
    lineInviteUrl: contact.lineInviteUrl || null, phone: contact.phone || null,
    published: shopPublished(shop, s), ownerUid: s.ownerUid, ownerLineUid: s.ownerLineUid,
    itemOff: off, rule: cartRule(off),
    items: s.items.filter((i) => !i.paused).map((it) => {
      const { id, name, price, note, photos, availableAfter } = it;
      const after = availableAfter && availableAfter > tokyoYmd() ? afterLbl(availableAfter) : "";
      return {
        id, name, price, note, photos: photos || [],
        ...(availableAfter ? { availableAfter } : {}),
        ...(after ? { after } : {}),
        ...itemFlags(s, it),
      };
    }),
  };
}

export default function ShopBuyerView({ shop, embed, onReady }: Props) {
  const [state, setState] = useState<State | null>(null);
  const [day, setDay] = useState("");
  const cartKey = `ss-cart-${shop}`;
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [viewPic, setViewPic] = useState<string | null>(null);
  const [checkout, setCheckout] = useState(false);
  const [slot, setSlot] = useState<string | null>(null);
  const [method, setMethod] = useState<Method | null>(null);
  const [lineName, setLineName] = useState("");
  const knownName = useSyncExternalStore(subscribeAuth, getName, () => "");
  const lineUid = useSyncExternalStore(subscribeAuth, getLineUid, () => "");
  const myShop = useSyncExternalStore(subscribeAuth, getId, () => "");
  const lang = useLang();
  const [chanOk, setChanOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [priceDir, setPriceDir] = usePriceDir();
  const [dense, setDense] = useDense();
  const [showSold, setShowSold] = useShowSold();
  const [ownedId, setOwnedId] = useState("");
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const open = (openId && state?.items.find((i) => i.id === openId)) || null;
  const myKeys = mineKeys(lineName);
  const jimotyUrl = (state?.jimotyUrl || "").trim();
  const facebookUrl = (state?.facebookUrl || "").trim();
  const lineUrl = (state?.lineInviteUrl || "").trim();
  const phoneDisp = (state?.phone || "").trim();
  const otherUrl = (state?.otherUrl || "").trim();
  const otherHref = extHref(otherUrl);
  const canJimoty = !!jimotyUrl, canLine = !!lineUrl, canFb = !!facebookUrl;
  const canOther = !!otherUrl;
  const methodOpts = (
    [["jimoty", canJimoty], ["facebook", canFb], ["line", canLine], ["other", canOther]] as const
  ).filter(([, ok]) => ok).map(([id]) => [id, CH[id][0]] as [Method, string]);
  const chanHref: Record<Method, string> = {
    jimoty: jimotyUrl, facebook: facebookUrl, line: lineUrl, phone: telHref(phoneDisp), other: otherHref,
  };
  const chanLbl: Record<Method, string> = {
    jimoty: "出品者のジモティー", facebook: "Facebook Marketplace", line: "LINE招待リンク",
    phone: phoneDisp, other: otherHref ? "その他の連絡先" : otherUrl,
  };
  const barMove = moveOutLeft(state?.moveOut ? [state.moveOut] : []);
  const loggedIn = !!(knownName || lineUid);
  const hardLine = !!lineUid;
  /** Own shop (ownerUid / soft pointer / LINE uid) → 出品を管理. */
  const isMine = ownedId === shop || myShop === shop
    || (!!lineUid && state?.ownerLineUid === lineUid);
  /** Name field always shown — typing soft-logs (openShop); phone is typed as-is. */
  const contactVal = lineName.trim();

  useEffect(() => {
    setOpenId(null); setCheckout(false); setReceipt(null); setViewPic(null); setBusy(false); setErr(null);
    try {
      const raw = JSON.parse(localStorage.getItem(cartKey) || "[]");
      if (Array.isArray(raw)) setPicked(new Set(raw.map(String)));
    } catch { /* ignore */ }
    const unsub = listenShop(shop, (s) => {
      const next = toBuyerState(shop, s);
      setState(next);
      onReadyRef.current?.();
      setOpenId((id) => (id && next.items.some((i) => i.id === id) ? id : null));
      setDay((d) => (d && next.days?.includes(d) ? d : (next.days?.[0] || "")));
    }, (e) => setErr(e.message || "読み込みに失敗しました"));
    const n = getName();
    if (n) setLineName(n);
    else void applyLineSession().then((s) => { if (s?.name) setLineName(s.name); });
    return unsub;
  }, [shop, cartKey]);

  useEffect(() => {
    if (!loggedIn) { setOwnedId(""); return; }
    let dead = false;
    void findOwnedShop().then((id) => { if (!dead) setOwnedId(id); }).catch(() => { if (!dead) setOwnedId(""); });
    return () => { dead = true; };
  }, [loggedIn, lineUid, knownName]);

  /** After「LINEでログインして並ぶ」OAuth — join once, then clear. */
  useEffect(() => {
    let raw = "";
    try { raw = sessionStorage.getItem(WL_KEY) || ""; } catch { return; }
    if (!raw.startsWith(`${shop}|`)) return;
    const itemId = raw.slice(shop.length + 1);
    if (!itemId || !lineUid) return;
    const n = getName();
    if (!n) return;
    try { sessionStorage.removeItem(WL_KEY); } catch { /* ignore */ }
    void (async () => {
      setBusy(true); setErr(null); setOpenId(itemId);
      try {
        await joinWaitLive(shop, itemId, n, mineKeys(n), lineUid);
        notifyLine(lineUid, "waitlist");
        setState((prev) => prev && {
          ...prev,
          items: prev.items.map((it) => {
            if (it.id !== itemId) return it;
            const was = it.waitAs?.includes(n);
            return {
              ...it,
              waitN: was ? (it.waitN || 0) : (it.waitN || 0) + 1,
              waitAs: [...new Set([...(it.waitAs || []), n])],
            };
          }),
        });
      } catch (e) { setErr(e instanceof Error ? e.message : "失敗しました"); }
      finally { setBusy(false); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shop, knownName, lineUid]);
  useBodyScrollLock(!!open || checkout);
  useEffect(() => {
    if (!open && !checkout) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      if (viewPic) { setViewPic(null); return; }
      if (checkout) setCheckout(false);
      else setOpenId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, checkout, viewPic]);

  const gridItems = [...(state?.items || [])].sort(byPrice(priceDir));
  const listItems = showSold ? gridItems : gridItems.filter((i) => !i.sold);
  const pickedItems = (state?.items || []).filter((i) => picked.has(i.id) && !locked(i));
  const waitItems = (state?.items || []).filter((i) => i.waitAs?.some((a) => myKeys.includes(a)));
  const after = cartAfter(pickedItems);
  const shopDays = state?.days || [];
  const days = after ? shopDays.filter((d) => d >= after) : shopDays;
  const afterBlocks = !!(after && shopDays.some((d) => d < after));
  useEffect(() => {
    const next = after ? (state?.days || []).filter((d) => d >= after) : (state?.days || []);
    if (!next.length) { if (day) setDay(""); return; }
    if (!next.includes(day)) { setDay(next[0]); setSlot(null); }
  }, [state?.days, after, day]);
  const freeSlots = (state?.slots || []).filter((s) => !(state?.taken?.[day] || []).includes(s));
  useEffect(() => {
    if (slot && (!(state?.slots || []).includes(slot) || (state?.taken?.[day] || []).includes(slot))) setSlot(null);
  }, [state, day, slot]);
  const cartSub = pickedItems.reduce((n, i) => n + (i.price ?? 0), 0);
  const itemOff = Number(state?.itemOff) || 0;
  const cartOff = cartDiscount(pickedItems.length, itemOff);
  const cartTotal = Math.max(0, cartSub - cartOff);
  const canSend = !!slot && !!method && !!contactVal && chanOk && pickedItems.length > 0
    && ({ jimoty: canJimoty, facebook: canFb, line: canLine, phone: false, other: canOther }[method])
    && (!after || day >= after);
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
    if (!n) { setErr("ログインしてください"); return; }
    if (!lineUid && !getName()) openShop(n);
    setLineName(n); setErr(null); setBusy(true);
    try {
      await joinWaitLive(shop, id, n, mineKeys(n), lineUid);
      if (lineUid) notifyLine(lineUid, "waitlist");
      setState((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          items: prev.items.map((it) => {
            if (it.id !== id) return it;
            const was = it.waitAs?.includes(n);
            return {
              ...it,
              waitN: was ? (it.waitN || 0) : (it.waitN || 0) + 1,
              waitAs: [...new Set([...(it.waitAs || []), n])],
            };
          }),
        };
      });
    } catch (e) { setErr(e instanceof Error ? e.message : "失敗しました"); }
    finally { setBusy(false); }
  }

  async function leaveWait(id: string) {
    const keys = mineKeys(lineName);
    if (!keys.length) { setErr("ログインしてください"); return; }
    setErr(null); setBusy(true);
    try {
      await leaveWaitLive(shop, id, keys);
      setState((prev) => prev && {
        ...prev,
        items: prev.items.map((it) => {
          if (it.id !== id) return it;
          const nextAs = (it.waitAs || []).filter((a) => !keys.includes(a));
          return { ...it, waitAs: nextAs, waitN: nextAs.length };
        }),
      });
    } catch (e) { setErr(e instanceof Error ? e.message : "失敗しました"); }
    finally { setBusy(false); }
  }

  function closeDetail() { setViewPic(null); setOpenId(null); }
  const detailMask = useMaskDismiss(closeDetail);

  async function book() {
    const itemIds = pickedItems.map((i) => i.id);
    if (!itemIds.length || !slot || !method || !contactVal || busy || !canSend) return;
    setBusy(true); setErr(null);
    setState((prev) => prev && {
      ...prev,
      items: prev.items.map((it) => itemIds.includes(it.id) ? { ...it, reqN: (it.reqN || 0) + 1 } : it),
      taken: { ...prev.taken, [day]: [...new Set([...(prev.taken[day] || []), slot])] },
    });
    try {
      const data = await bookShop(shop, {
        day, slot, itemIds, contactMethod: method, contact: contactVal,
        lineUid: lineUid || undefined,
      });
      if (method === "jimoty" || method === "facebook"
        || (method === "line" && !hardLine)) {
        openShop(contactVal, method);
      }
      pushBuy({
        code: String(data.code || ""), shop, day, slot,
        items: Array.isArray(data.items) ? data.items.map(String) : [],
      });
      setCheckout(false); setOpenId(null);
      setReceipt({ day, slot, total: data.total });
      setPicked(new Set());
      try { localStorage.removeItem(cartKey); } catch { /* ignore */ }
      setSlot(null); setMethod(null); setChanOk(false);
    } catch (e) { setErr(e instanceof Error ? e.message : "失敗しました"); }
    finally { setBusy(false); }
  }

  if (receipt) {
    return (
      <main className="wrap">
        <h1>ありがとう。依頼を受けました</h1>
        <p className="hint">{dayLbl(receipt.day)} {slotTime(receipt.slot) || receipt.slot} · {money(receipt.total ?? 0)}。選んだ連絡方法で、だいたい2日以内に返事します。履歴は下の名前から。</p>
        <button type="button" className="dark" onClick={() => setReceipt(null)}>一覧に戻る</button>
      </main>
    );
  }

  if (!state) return <main className={`buy${embed ? " embed" : ""}`} aria-busy="true" />;

  const soldOpen = !!open?.sold;
  const takenOpen = !!open?.taken && !soldOpen;
  const onOpen = open ? picked.has(open.id) : false;
  const waiting = !!open?.waitAs?.some((a) => myKeys.includes(a));
  const openPics = open?.photos || [];
  const canWaitSoft = !!(getName() || lineName).trim() || hardLine;
  const yt = (state?.youtubeUrl || "").trim() || ytUrl(state?.bio || "");
  const bioShow = yt && state?.bio
    ? state.bio.replace(yt, "").replace(/[：:]\s*$/m, "").trimEnd()
    : state?.bio;

  return (
    <main className={`buy${embed ? " embed" : " shop-in"}`}>
      <header className="bar">
        <span className="area">{(state.address || "").trim()}</span>
        <span className="span">{barMove}</span>
        <button type="button" className="req"
          onClick={() => {
            const n = getName();
            if (n) setLineName(n);
            setOpenId(null); setSlot(null);
            setMethod(canJimoty ? "jimoty" : canFb ? "facebook" : canLine ? "line"
              : canOther ? "other" : null);
            setChanOk(false); setErr(null); setCheckout(true);
          }}>
          {pickedItems.length
            ? t("buy.ctaN", lang, { n: pickedItems.length })
            : t("buy.cta", lang)}
        </button>
      </header>
      {bioShow ? <p className="hint bio">{bioShow}</p> : null}
      {(jimotyUrl || facebookUrl || otherUrl || rule) ? (
        <p className="ext-links">
          {jimotyUrl ? (
            <a className="ext-link" href={jimotyUrl} target="_blank" rel="noopener noreferrer">ジモティー</a>
          ) : null}
          {rule ? <span className="ask">{rule}</span> : null}
          {facebookUrl ? (
            <a className="ext-link fb" href={facebookUrl} target="_blank" rel="noopener noreferrer">
              Facebook Marketplace
            </a>
          ) : null}
          {otherUrl ? (otherHref ? (
            <a className="ext-link" href={otherHref} target="_blank" rel="noopener noreferrer">その他</a>
          ) : <span className="ext-link">{otherUrl}</span>) : null}
          {/* 内見動画 temporarily hidden (SS-315); admin youtubeUrl kept. */}
        </p>
      ) : null}
      {isMine && !embed && (
        <div className="claim-banner">
          <Link className="cta go" href={adminPath(shop)} prefetch>{t("claim.manage", lang)}</Link>
        </div>
      )}
      {err && !checkout && !open && <div className="err">{err}</div>}
      {gridItems.length > 0 && (
        <ListingTools dir={priceDir} onDir={setPriceDir} dense={dense} onDense={setDense}
          showSold={showSold} onShowSold={setShowSold} />
      )}
      <Listings items={listItems} dense={dense}
        onSelect={(it) => { setErr(null); setOpenId(it.id); }}
        classNameFor={(item) => `${picked.has(item.id) ? "on" : ""}${item.sold ? " sold" : item.taken ? " booked" : item.reqN ? " req" : ""}`.trim()} />
      {open && !checkout && (
        <div className="mask drawer" role="dialog" aria-modal="true" aria-label={open.name} {...detailMask}>
          <div className="sheet drawer" onClick={(e) => e.stopPropagation()}>
            {openPics.length > 0 && <div className="pics">{openPics.map((src) => <img key={src} src={src} alt="" loading="lazy" decoding="async" onClick={() => setViewPic(src)} />)}</div>}
            <div className="dr-side">
              <div className="sp">{money(open.price)}</div>
              <h2>{open.name}</h2>
              {open.note ? <p className="sn">{open.note}</p> : null}
              {open.availableAfter && open.availableAfter > tokyoYmd() ? (
                <p className="hint">{dayLbl(open.availableAfter)}以降受取可</p>
              ) : null}
              {soldOpen ? (
                <p className="sw sold">{t("badge.sold", lang)}</p>
              ) : takenOpen ? (
                <>
                  <p className="sw sold">{t("badge.booked", lang)}{open.when ? ` — ${open.when}` : ""}</p>
                  {open.waitN ? <p className="sw">{open.waitN}人待ち</p> : null}
                  {err && <div className="err">{err}</div>}
                  {waiting ? (
                    <button type="button" className="cta soft" disabled={busy}
                      onClick={() => void leaveWait(open.id)}>順番をやめる</button>
                  ) : canWaitSoft ? (
                    <button type="button" className="cta go" disabled={busy}
                      onClick={() => void joinWait(open.id)}>キャンセル待ち</button>
                  ) : (
                    <a className="cta line" href={lineLoginHref()}
                      onClick={() => { try { sessionStorage.setItem(WL_KEY, `${shop}|${open.id}`); } catch { /* */ } }}>
                      LINEでログインして並ぶ
                    </a>
                  )}
                </>
              ) : (
                <>
                  {open.reqN ? <p className="sw">{t("badge.reqN", lang, { n: open.reqN })}</p> : null}
                  <button type="button" className={`cta${onOpen ? " soft" : " go"}`}
                    onClick={() => { toggle(open.id); closeDetail(); }}>
                    {onOpen ? "外す" : open.reqN ? "次に並ぶ" : "追加"}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
      {viewPic && open && (
        <PhotoLightbox src={viewPic} onClose={() => setViewPic(null)} />
      )}
      {checkout && (
        <div className="mask" role="dialog" aria-modal="true" aria-label="引き取り日程"
          onClick={() => { setCheckout(false); setErr(null); }}>
          <div className="sheet checkout" onClick={(e) => e.stopPropagation()}>
            <h2>引き取り日程</h2>
            <div className="when">
              <span className="date-ctl"><select value={day} aria-label="日付" onChange={(e) => { setDay(e.target.value); setSlot(null); }}>
                {days.map((d) => <option key={d} value={d}>{dayLbl(d)}</option>)}
              </select></span>
              <div className="slots" role="group" aria-label="時間帯">
                {freeSlots.map((s) => (
                  <button key={s} type="button" aria-pressed={slot === s}
                    className={slot === s ? "slot on" : "slot"}
                    onClick={() => setSlot(s)}>{s}</button>
                ))}
              </div>
            </div>
            {afterBlocks && after ? (
              <p className="hint">一部の品は{dayLbl(after)}以降に受け取れます</p>
            ) : null}
            {!days.length ? <p className="sw">予約できる日がありません。</p>
              : !freeSlots.length ? <p className="sw">この日は空きがありません。</p> : null}
            <p className="total">現金合計 {money(cartTotal)}</p>
            {cartOff > 0 ? (
              <p className="hint">まとめ買い −{money(cartOff)}（1点¥{itemOff.toLocaleString("ja-JP")}×{pickedItems.length}）</p>
            ) : null}
            <ul className="claim-items">{pickedItems.map((i) => (
              <li key={i.id}><span>{i.name?.trim() || "無題"}</span><span>{money(i.price)}</span></li>
            )).concat(waitItems.map((i) => (
              <li key={i.id}><span>{i.name?.trim() || "無題"} · キャンセル待ち</span><span>{money(i.price)}</span></li>
            )))}</ul>
            <div className="field contact"><span>連絡方法</span>
              {!methodOpts.length ? (
                <p className="sw">出品者の連絡先が未設定です。しばらくしてから再度お試しください。</p>
              ) : (
                <>
                  <Seg label="連絡方法" value={method || ""} onPick={(v) => { setMethod(v as Method); setChanOk(false); }}
                    opts={methodOpts} />
                  {method && <>
                    <div className="linebox">
                      {chanHref[method] ? (
                        <a className={`linelink${method === "facebook" ? " fb" : ""}`} target="_blank" rel="noopener noreferrer"
                          href={chanHref[method]}>{chanLbl[method]}</a>
                      ) : <span className="linelink">{chanLbl[method]}</span>}
                      <label className="late-check"><input type="checkbox" checked={chanOk}
                        onChange={(e) => setChanOk(e.target.checked)} />{CH[method][1]}</label>
                    </div>
                    {method === "jimoty" ? (
                      <p className="hint">ジモティーから来た方は、できればジモティー上で取引を完了してください。</p>
                    ) : method === "line" ? (
                      <p className="hint">ジモティーのアカウントをお持ちでない方向けです。</p>
                    ) : null}
                    <label className="float"><span>{CH[method][2]}</span>
                      <input value={lineName} onChange={(e) => {
                        const v = e.target.value;
                        setLineName(v);
                        const n = v.trim();
                        if (n && method !== "phone" && method !== "other"
                          && !(method === "line" && hardLine)) {
                          openShop(n, method);
                        }
                      }}
                        placeholder={method === "phone" ? "080-0000-0000" : "表示名"}
                        inputMode={method === "phone" ? "tel" : "text"} autoComplete="nickname"
                        enterKeyHint="done" /></label>
                  </>}
                </>
              )}
            </div>
            {err && <div className="err">{err}</div>}
            <button type="button" className={`cta${canSend ? " go" : ""}`} disabled={busy || !canSend}
              onClick={book}>{busy ? "送信中…" : "依頼を送信"}</button>
            {method === "jimoty" && !hardLine && (
              <>
                <p className="hint">{t("buy.lineHint", lang)}</p>
                <a className="cta line" href={lineLoginHref()}>{t("buy.lineLogin", lang)}</a>
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
