"use client";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type PointerEvent as PtrEv } from "react";
import { useRouter } from "next/navigation";
import { DateField, Icon, IconBtn } from "@/components/icons";
import { byPrice, Listings, ListingTools, Seg, useDense, usePriceDir, useShowSold, type PhotoItem } from "@/components/photo-listing";
import SquareCam from "@/components/square-cam";
import { Snack, useBodyScrollLock, useMaskDismiss, useSnack } from "@/components/snack";
import { compressImage, ensureImageFile, isImageFile } from "@/lib/compress";
import { dayLbl, daysBetween, tokyoYmd } from "@/lib/days";
import { DECLINE_PRESETS, DEF_LEAD, ELTON_SPOTS, PICKUP_DAYS, PICKUP_SLOTS, ytUrl } from "@/lib/sale";
import { adminAct, listenShop } from "@/lib/live";
import { forgetShop, getName, getProfile, openShop, saveProfile, subscribeAuth } from "@/lib/shop";
import { ELTON_SHOP, itemFlags, pickupDays, shopMins, shopPublished, uid, type PickupSpot, type Store } from "@/lib/store";
import { SITE_URL } from "@/lib/site";

type Item = PhotoItem & { claimId?: string | null; note?: string; paused?: boolean; jimoty?: boolean };
type Claim = {
  id: string; code: string; day: string; slot?: string; contact?: string; contactMethod?: string;
  itemIds: string[]; status: string; spotName?: string; spotMapsUrl?: string; offer?: number;
};
type AdminState = {
  address: string; bio?: string; jimotyUrl?: string; youtubeUrl?: string;
  lineInviteUrl?: string; phone?: string; slots?: string[]; pickupSpots?: PickupSpot[];
  pickupFrom?: string; pickupTo?: string; moveOut?: string; leadDays?: number;
  minItems?: number; minTotal?: number; published?: boolean;
  items: Item[]; claims: Claim[];
};
type Props = { shop: string; name: string };
const fmtSlot = (a: string, b: string) => `${a}–${b}`;
const DEF_FROM = PICKUP_DAYS[0];
const DEF_TO = PICKUP_DAYS[PICKUP_DAYS.length - 1];
const IMG_ACCEPT = "image/*,image/jpeg,image/jpg,image/png,image/heic,image/heif,image/webp,image/gif,.jpg,.jpeg,.png,.heic,.heif,.webp,.gif";
type ContactMode = "jimoty" | "line" | "phone";
const methodJa = (m?: string) => (m === "jimoty" ? "ジモティー" : m === "phone" ? "電話" : m === "line" ? "LINE" : m || "");
const kuStem = (v: string) => v.replace(/区$/, "");
const kuFull = (v: string) => { const s = kuStem(v).trim(); return s ? `${s}区` : ""; };
const itemLabel = (it?: Item | null) => it?.name?.trim() || "無題";
const isRemote = (u: string) => /^https?:\/\//i.test(u);
type PicStatus = "uploading" | "error";
/** In-flight uploads only — listing rows come from onSnapshot. */
type PicJob = { file: File; itemId: string; busy?: boolean };
function claimItems(c: Claim, all: Item[]) {
  return c.itemIds
    .map((id) => all.find((i) => i.id === id) || { id, name: "無題", price: null as number | null })
    .sort(byPrice("desc"));
}
const claimWho = (c: Claim) => (c.contact && c.contact !== "LINE" && c.contact !== "ジモティー" ? c.contact : "");
function ClaimRow({ c, items, onOpen }: { c: Claim; items: Item[]; onOpen: (id: string) => void }) {
  const its = claimItems(c, items), n = daysBetween(tokyoYmd(), c.day).length - 1;
  const soon = n === 0 ? "今日" : n === 1 ? "明日" : n > 0 && n <= 3 ? `あと${n}日` : "";
  return (
    <li>
      <button type="button" className="tl-r" onClick={() => onOpen(c.id)}>
        <span className="tl-when">{dayLbl(c.day)} {c.slot || "—"}{c.status === "picked_up" ? " · 完了" : ""}
          {soon ? <span className="tl-soon">{soon}</span> : null}</span>
        <span className="tl-goods">{its.flatMap((it) => it.photos?.[0] ? [<img key={it.id} src={it.photos[0]} alt="" />] : []).slice(0, 4)}
          <span className="tl-sum">{[claimWho(c), its.map(itemLabel).join("、"),
            c.offer != null ? `希望¥${c.offer.toLocaleString("ja-JP")}` : ""].filter(Boolean).join(" · ")}</span></span>
      </button>
    </li>
  );
}

/** Muse AI seed — Sayonara→Jimoty listing sync via copy-paste. */
function musePrompt(shop: string, bio: string, items: { name?: string; price?: number | null }[]) {
  const invite = `${SITE_URL}/s/${shop}`;
  const list = items.slice(0, 40).map((it) =>
    `- ${(it.name || "").trim() || "無題"}${it.price != null ? ` ¥${Number(it.price).toLocaleString("ja-JP")}` : ""}`).join("\n");
  const memo = bio.trim()
    ? `${bio.trim()}\n\nまとめて予約・受け渡し → ${invite}`
    : `まとめて予約・受け渡しは Sayonara → ${invite}`;
  return `Sayonaraの出品をジモティ向けに整えて（簡潔・日本語・コピペ用）。約24時間ごとにSayonaraを見なおしてジモティへ同期して：\n\n【招待】\n${memo}\n\n【出品一覧】\n${list || "（なし）"}\n`;
}

export default function ShopAdminView({ shop, name }: Props) {
  const router = useRouter();
  const [data, setData] = useState<AdminState | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [listBusy, setListBusy] = useState(false);
  const [picBusy, setPicBusy] = useState<Record<string, PicStatus>>({});
  const picJobs = useRef<Record<string, PicJob>>({});
  /** Blob previews by real item id (not listing SOT). */
  const [localPics, setLocalPics] = useState<Record<string, string[]>>({});
  const [deleting, setDeleting] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPrice, setEditPrice] = useState("0");
  const [editNote, setEditNote] = useState("");
  const [itemMenu, setItemMenu] = useState(false);
  const [viewPic, setViewPic] = useState<string | null>(null);
  const [claimId, setClaimId] = useState<string | null>(null);
  /** Claim sheet subpane: polite decline presets or 日程変更 stub. */
  const [pane, setPane] = useState<null | "decline" | "resched">(null);
  const [rsDay, setRsDay] = useState("");
  const [rsSlot, setRsSlot] = useState<string | null>(null);
  const [rsOk, setRsOk] = useState(false);
  /** Checked line-items that stay on the 依頼; unchecked leave + become available. */
  const [keep, setKeep] = useState<string[]>([]);
  const [showDone, setShowDone] = useState(false);
  const softName = useSyncExternalStore(subscribeAuth, getName, () => "");
  const logged = !!softName;
  const label = softName || (/^\d{5}$/.test(name) ? "" : name);
  const [camOpen, setCamOpen] = useState(false);
  const [camItemId, setCamItemId] = useState<string | null>(null);
  const [bio, setBio] = useState("");
  const [jimoty, setJimoty] = useState("");
  const [youtube, setYoutube] = useState("");
  const [lineInvite, setLineInvite] = useState("");
  const [phone, setPhone] = useState("");
  const [contactMode, setContactMode] = useState<ContactMode>("jimoty");
  const [slots, setSlots] = useState<string[]>([...PICKUP_SLOTS]);
  const [spots, setSpots] = useState<PickupSpot[]>([]);
  const [slotA, setSlotA] = useState("11:00");
  const [slotB, setSlotB] = useState("11:15");
  const [slotOpen, setSlotOpen] = useState(false);
  const [pickupFrom, setPickupFrom] = useState(DEF_FROM);
  const [pickupTo, setPickupTo] = useState(DEF_TO);
  const [leadDays, setLeadDays] = useState(DEF_LEAD);
  const [minItems, setMinItems] = useState(0);
  const [minTotal, setMinTotal] = useState(0);
  const [listOpen, setListOpen] = useState(false);
  const [listDraft, setListDraft] = useState("");
  const [jmDraft, setJmDraft] = useState("");
  const [jmBusy, setJmBusy] = useState(false);
  type JmPrev = { id: string; name: string; url: string; samples: { name: string; price: number; photo?: string; url?: string }[] };
  const [jmPrev, setJmPrev] = useState<JmPrev | null>(null);
  const [jmCands, setJmCands] = useState<JmPrev[]>([]);
  const [jmWipeBusy, setJmWipeBusy] = useState(false);
  const [jmMore, setJmMore] = useState(false);
  const [wipeTyped, setWipeTyped] = useState<string | null>(null);
  const [delShopBusy, setDelShopBusy] = useState(false);
  const listRef = useRef<HTMLInputElement | null>(null);
  const dragRef = useRef<{ from: number; over: number; x: number; y: number; moved: boolean } | null>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const [pub, setPub] = useState<"off" | "on">("off");
  const { snack, show } = useSnack();
  const [addrDraft, setAddrDraft] = useState("");
  const addrDraftRef = useRef("");
  const addrTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const addrSaved = useRef("");
  const addrDirty = useRef(false);
  const addrReq = useRef(0);
  const editTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editIdRef = useRef<string | null>(null);
  const editDraftRef = useRef({ name: "", price: "0", note: "" });
  const editSavedRef = useRef<{ id: string; name: string; price: number; note: string } | null>(null);
  const editReq = useRef(0);
  const [priceDir, setPriceDir] = usePriceDir();
  const [dense, setDense] = useDense();
  const [showSold, setShowSold] = useShowSold();

  const applySnap = useCallback((body: Store) => {
    setErr(null);
    setData(body as AdminState);
    addrSaved.current = body.address || "";
    if (!addrDirty.current) {
      const stem = kuStem(body.address || "");
      addrDraftRef.current = stem;
      setAddrDraft(stem);
    }
    const local = getProfile();
    const bioVal = body.bio || local.bio || "";
    setBio(bioVal);
    const j = body.jimotyUrl || local.jimotyUrl || "";
    const l = body.lineInviteUrl || "", p = body.phone || "";
    setJimoty(j); setLineInvite(l); setPhone(p);
    setYoutube(body.youtubeUrl || ytUrl(bioVal) || local.youtubeUrl || "");
    setContactMode((j.trim() && "jimoty") || (l.trim() && "line") || (p.trim() && "phone") || "jimoty");
    setSlots(body.slots?.length ? body.slots : [...PICKUP_SLOTS]);
    setSpots(body.pickupSpots || []);
    setPickupFrom(body.pickupFrom || DEF_FROM);
    setPickupTo(body.pickupTo || body.moveOut || DEF_TO);
    setLeadDays(body.leadDays ?? DEF_LEAD);
    const m = shopMins(body);
    setMinItems(m.minItems); setMinTotal(m.minTotal);
    if (shopPublished(shop, body)) setPub("on");
  }, [shop]);

  useEffect(() => {
    const unsub = listenShop(shop, applySnap, (e) => {
      setErr(e.message || "読み込みに失敗しました");
      show(e.message || "読み込みに失敗しました", "err");
    }, { claimOwner: true });
    return unsub;
  }, [shop, applySnap, show]);
  useEffect(() => () => {
    if (addrTimer.current) clearTimeout(addrTimer.current);
    if (editTimer.current) { clearTimeout(editTimer.current); editTimer.current = null; }
  }, []);

  const items = useMemo(
    () => [...(data?.items || [])].sort(byPrice(priceDir)),
    [data?.items, priceDir],
  );
  const listItems = showSold || !data ? items : items.filter((it) => !itemFlags(data as Store, it).taken);
  const open = useMemo(() => items.find((i) => i.id === openId) || null, [items, openId]);
  const pics = useMemo(() => {
    if (!open) return [] as string[];
    const remotes = open.photos || [];
    const locals = localPics[open.id] || [];
    return locals.length ? [...remotes, ...locals.filter((u) => !remotes.includes(u))] : remotes;
  }, [open, localPics]);
  const claims = data?.claims || [];
  const claimOpen = useMemo(() => claims.find((c) => c.id === claimId) || null, [claims, claimId]);
  const requests = claims.filter((c) => c.status === "requested");
  const pending = claims.filter((c) => c.status === "booked" || (showDone && c.status === "picked_up"));
  const hasDone = claims.some((c) => c.status === "picked_up");
  const claimList = useMemo(
    () => (claimOpen && data ? claimItems(claimOpen, data.items) : []),
    [claimOpen, data],
  );
  const keepDirty = !!claimOpen && (
    keep.length !== claimOpen.itemIds.length || keep.some((id) => !claimOpen.itemIds.includes(id))
  );
  const rsDays = data ? pickupDays(data as Store) : [];
  const rsOpts = rsDay && !rsDays.includes(rsDay) ? [rsDay, ...rsDays] : rsDays;

  async function act(payload: Record<string, unknown>, okMsg?: string) {
    setErr(null);
    try {
      const body = await adminAct(shop, payload) as Record<string, unknown>;
      if (okMsg) show(okMsg, "ok");
      return body;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "失敗しました";
      setErr(msg); show(msg, "err");
      return null;
    }
  }

  async function saveAddress(raw: string) {
    const next = kuFull(raw);
    if (next === addrSaved.current) return;
    const req = ++addrReq.current;
    setErr(null);
    try {
      const body = await adminAct(shop, { action: "address", address: next }) as { address?: string };
      if (req !== addrReq.current) return;
      const saved = String(body.address ?? next);
      addrSaved.current = saved;
      if (kuFull(addrDraftRef.current) === saved) addrDirty.current = false;
      show("保存しました", "ok");
    } catch (e) {
      if (req !== addrReq.current) return;
      const msg = e instanceof Error ? e.message : "失敗しました";
      setErr(msg); show(msg, "err");
    }
  }

  function onAddressChange(value: string) {
    const stem = kuStem(value);
    addrDirty.current = true;
    addrDraftRef.current = stem;
    setAddrDraft(stem);
    if (addrTimer.current) clearTimeout(addrTimer.current);
    addrTimer.current = setTimeout(() => { void saveAddress(stem); }, 450);
  }

  async function persistProfile(
    nextBio: string, nextJimoty: string, nextYt = youtube,
    nextLine = lineInvite, nextPhone = phone,
  ) {
    const yt = nextYt.trim() || ytUrl(nextBio);
    saveProfile({ bio: nextBio, jimotyUrl: nextJimoty, youtubeUrl: yt });
    await act({
      action: "profile", bio: nextBio, jimotyUrl: nextJimoty, youtubeUrl: yt,
      lineInviteUrl: nextLine, phone: nextPhone,
    });
    if (yt !== nextYt) setYoutube(yt);
  }

  function openDetail(item: Item) {
    setItemMenu(false);
    setViewPic(null);
    if (editTimer.current) { clearTimeout(editTimer.current); editTimer.current = null; }
    if (editIdRef.current && editIdRef.current !== item.id) void flushEdit();
    const snap = { id: item.id, name: item.name, price: item.price ?? 0, note: item.note || "" };
    editIdRef.current = item.id;
    editSavedRef.current = snap;
    editDraftRef.current = { name: snap.name, price: String(snap.price), note: snap.note };
    setOpenId(item.id);
    setEditName(snap.name);
    setEditPrice(String(snap.price));
    setEditNote(snap.note);
  }

  function scheduleEdit() {
    if (editTimer.current) clearTimeout(editTimer.current);
    editTimer.current = setTimeout(() => { void flushEdit(); }, 450);
  }

  function patchEdit<K extends keyof typeof editDraftRef.current>(key: K, value: (typeof editDraftRef.current)[K]) {
    editDraftRef.current = { ...editDraftRef.current, [key]: value };
    if (key === "name") setEditName(value as string);
    else if (key === "price") setEditPrice(value as string);
    else setEditNote(value as string);
    scheduleEdit();
  }

  async function flushEdit() {
    if (editTimer.current) { clearTimeout(editTimer.current); editTimer.current = null; }
    const id = editIdRef.current;
    const draft = editDraftRef.current;
    const saved = editSavedRef.current;
    if (!id || !saved || saved.id !== id) return;
    const price = draft.price === "" ? 0 : Number(draft.price);
    const note = draft.note.trim();
    const payload: Record<string, unknown> = { action: "edit", id };
    let changed = false;
    if (draft.name !== saved.name) { payload.name = draft.name; changed = true; }
    if (price !== saved.price) { payload.price = price; changed = true; }
    if (note !== saved.note) { payload.note = note; changed = true; }
    if (!changed) return;
    const prev = saved;
    const req = ++editReq.current;
    const ok = await act(payload);
    if (!ok || req !== editReq.current) return;
    editSavedRef.current = { id, name: draft.name, price, note };
    show("保存しました", "ok", { label: "元に戻す", onClick: () => { void undoEdit(prev); } });
  }

  async function undoEdit(prev: { id: string; name: string; price: number; note: string }) {
    if (editTimer.current) { clearTimeout(editTimer.current); editTimer.current = null; }
    editReq.current++;
    const ok = await act({
      action: "edit", id: prev.id, name: prev.name, price: prev.price, note: prev.note,
    });
    if (!ok) return;
    editSavedRef.current = prev;
    if (editIdRef.current === prev.id) {
      editDraftRef.current = { name: prev.name, price: String(prev.price), note: prev.note };
      setEditName(prev.name);
      setEditPrice(String(prev.price));
      setEditNote(prev.note);
    }
    show("元に戻しました", "ok");
  }

  async function togglePause(item: Item) {
    const next = !item.paused;
    const ok = await act({ action: "edit", id: item.id, paused: next });
    if (ok) show(next ? "一時停止しました" : "再開しました", "ok");
  }

  function closeEdit() {
    setItemMenu(false);
    setViewPic(null);
    setOpenId(null);
    void flushEdit();
  }

  useEffect(() => {
    if (!openId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || deleting === openId) return;
      e.preventDefault();
      if (viewPic) { setViewPic(null); return; }
      closeEdit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openId, deleting, viewPic]);

  function setPicStatus(url: string, st: PicStatus | null) {
    setPicBusy((s) => {
      if (!st) {
        if (!(url in s)) return s;
        const next = { ...s };
        delete next[url];
        return next;
      }
      return { ...s, [url]: st };
    });
  }

  function pushLocalPic(itemId: string, url: string) {
    setLocalPics((s) => ({ ...s, [itemId]: [...(s[itemId] || []), url] }));
  }

  function dropLocalPic(itemId: string, url: string) {
    setLocalPics((s) => {
      const next = (s[itemId] || []).filter((u) => u !== url);
      if (!next.length) {
        const { [itemId]: _, ...rest } = s;
        return rest;
      }
      return { ...s, [itemId]: next };
    });
  }

  function clearItemLocals(itemId: string) {
    for (const [url, job] of Object.entries(picJobs.current)) {
      if (job.itemId !== itemId) continue;
      if (url.startsWith("blob:")) URL.revokeObjectURL(url);
      delete picJobs.current[url];
      setPicStatus(url, null);
    }
    setLocalPics((s) => {
      if (!(itemId in s)) return s;
      const { [itemId]: _, ...rest } = s;
      return rest;
    });
  }

  async function postUpload(file: File, itemId?: string) {
    const compressed = await compressImage(ensureImageFile(file));
    const fd = new FormData();
    fd.set("file", compressed);
    if (itemId) fd.set("itemId", itemId);
    const res = await fetch(`/api/admin/upload?shop=${encodeURIComponent(shop)}`, { method: "POST", body: fd });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || "アップロードに失敗しました");
    return body as { url?: string; itemId?: string };
  }

  function clearPicLocal(local: string, itemId?: string) {
    if (itemId) dropLocalPic(itemId, local);
    URL.revokeObjectURL(local);
    delete picJobs.current[local];
    setPicStatus(local, null);
  }

  async function runPicJob(local: string) {
    const job = picJobs.current[local];
    if (!job || job.busy) return;
    job.busy = true;
    setPicStatus(local, "uploading");
    setErr(null);
    try {
      const up = await postUpload(job.file, job.itemId);
      const remote = String(up.url || "");
      if (!remote) throw new Error("アップロードに失敗しました");
      if (!picJobs.current[local]) return;
      await adminAct(shop, { action: "edit", id: job.itemId, appendPhoto: remote });
      clearPicLocal(local, job.itemId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "アップロードに失敗しました";
      setErr(msg); show(msg, "err");
      setPicStatus(local, "error");
      if (picJobs.current[local]) picJobs.current[local].busy = false;
    }
  }

  function queueAppend(itemId: string, files: File[]) {
    const images = files.filter(isImageFile);
    if (!images.length) { show("画像を選択してください", "err"); return; }
    for (const file of images) {
      const local = URL.createObjectURL(file);
      picJobs.current[local] = { file, itemId };
      pushLocalPic(itemId, local);
      void runPicJob(local);
    }
  }

  /** Write empty listing to Firestore first; UI follows snap; then upload→appendPhoto. */
  function addFromPhotos(files: File[]) {
    const images = files.filter(isImageFile);
    if (!images.length) { show("画像を選択してください", "err"); return; }
    setErr(null);
    for (const file of images) {
      const id = uid("i");
      void (async () => {
        try {
          await adminAct(shop, { action: "add", id, name: "", photos: [] });
          queueAppend(id, [file]);
        } catch (e) {
          const msg = e instanceof Error ? e.message : "失敗しました";
          setErr(msg); show(msg, "err");
        }
      })();
    }
  }

  function retryPic(local: string) {
    if (picJobs.current[local] && !picJobs.current[local].busy) void runPicJob(local);
  }

  async function onListEnter() {
    const v = listDraft.trim();
    if (!v) {
      setListOpen(false);
      setListDraft("");
      return;
    }
    if (listBusy) return;
    setListBusy(true);
    const ok = await act({ action: "add", name: v }, "品目を追加しました");
    setListBusy(false);
    if (!ok) return;
    setListDraft("");
    requestAnimationFrame(() => listRef.current?.focus());
  }

  useEffect(() => {
    if (softName) setJmDraft((d) => d || softName);
  }, [softName]);

  async function lookupJimoty() {
    const name = jmDraft.trim() || softName.trim();
    if (!name) { show("ジモティ名を入力してください", "err"); return; }
    if (jmBusy) return;
    setJmBusy(true); setErr(null); setJmPrev(null); setJmCands([]);
    try {
      const res = await fetch(`/api/jimoty?name=${encodeURIComponent(name)}&preview=1`);
      const data = await res.json() as {
        error?: string; candidates?: JmPrev[];
        id?: string; name?: string; url?: string;
        samples?: JmPrev["samples"];
      };
      if (!res.ok) throw new Error(data.error || "失敗しました");
      if (data.candidates?.length) { setJmCands(data.candidates); return; }
      if (!data.id || !data.url) throw new Error("見つかりません");
      setJmPrev({
        id: data.id, name: data.name || name, url: data.url, samples: data.samples || [],
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "失敗しました";
      setErr(msg); show(msg, "err");
    } finally { setJmBusy(false); }
  }

  async function confirmJimoty(prev: JmPrev) {
    if (jmBusy) return;
    setJmBusy(true); setErr(null);
    try {
      const res = await fetch(`/api/jimoty?profile=${encodeURIComponent(prev.id)}`);
      const data = await res.json() as {
        error?: string; name?: string; url?: string;
        items?: { name: string; price: number; photo?: string }[];
      };
      if (!res.ok) throw new Error(data.error || "失敗しました");
      if (data.name) openShop(data.name);
      const url = data.url || prev.url;
      setJimoty(url);
      saveProfile({ bio, jimotyUrl: url, youtubeUrl: youtube });
      const ok = await act(
        { action: "import", items: data.items || [], jimotyUrl: url },
        `${data.items?.length || 0}件取り込みました`,
      );
      if (ok) { setJmDraft(data.name || prev.name); setJmPrev(null); setJmCands([]); }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "失敗しました";
      setErr(msg); show(msg, "err");
    } finally { setJmBusy(false); }
  }

  async function deleteEmptyShop() {
    if (delShopBusy || shop === ELTON_SHOP || items.length) return;
    if (!window.confirm("空のショップを削除しますか？")) return;
    setDelShopBusy(true);
    try {
      await adminAct(shop, { action: "deleteShop" });
      forgetShop(shop);
      show("ショップを削除しました", "ok");
      router.push("/");
    } catch (e) {
      show(e instanceof Error ? e.message : "削除に失敗しました", "err");
    } finally { setDelShopBusy(false); }
  }

  async function wipeJimotyImport() {
    if (wipeTyped !== "OK" || jmWipeBusy) return;
    const tagged = items.filter((i) => i.jimoty).length;
    const n = tagged || items.length;
    if (!n) { show("削除する出品がありません", "err"); return; }
    setJmWipeBusy(true); show("削除中…", "busy");
    try {
      const body = await adminAct(shop, { action: "wipeImport" }) as { count?: number };
      show(`${body.count || n}件削除しました`, "ok");
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : "失敗しました";
      setErr(errMsg); show(errMsg, "err");
    } finally { setJmWipeBusy(false); }
  }

  async function deleteItem(item: Item) {
    if (!confirm(`「${item.name || "無題"}」を削除しますか？`)) return;
    setDeleting(item.id); show("削除中…", "busy");
    clearItemLocals(item.id);
    if (openId === item.id || editIdRef.current === item.id) {
      if (editTimer.current) { clearTimeout(editTimer.current); editTimer.current = null; }
      editIdRef.current = null;
      editSavedRef.current = null;
      setOpenId(null);
    }
    try {
      await adminAct(shop, { action: "remove", id: item.id });
      show("削除しました", "ok");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "失敗しました";
      setErr(msg); show(msg, "err");
    } finally { setDeleting(null); }
  }

  async function deletePhoto(item: Item, url: string) {
    if (!confirm(`この写真を削除しますか？`)) return;
    if (url.startsWith("blob:")) {
      clearPicLocal(url, item.id);
      setViewPic((v) => (v === url ? null : v));
      show("写真を削除しました", "ok");
      return;
    }
    setViewPic((v) => (v === url ? null : v));
    try {
      await adminAct(shop, { action: "edit", id: item.id, removePhoto: url });
      show("写真を削除しました", "ok");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "失敗しました";
      setErr(msg); show(msg, "err");
    }
  }

  async function reorderPhotos(from: number, to: number) {
    if (!open || from === to || from < 0 || to < 0) return;
    const photos = [...pics];
    if (to >= photos.length) return;
    const [moved] = photos.splice(from, 1);
    photos.splice(to, 0, moved);
    const remotes = photos.filter(isRemote);
    const locals = photos.filter((u) => !isRemote(u));
    setLocalPics((s) => {
      if (!locals.length) {
        if (!(open.id in s)) return s;
        const { [open.id]: _, ...rest } = s;
        return rest;
      }
      return { ...s, [open.id]: locals };
    });
    try {
      await adminAct(shop, { action: "edit", id: open.id, photos: remotes });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "失敗しました";
      setErr(msg); show(msg, "err");
    }
  }

  function onPicPointerDown(e: PtrEv<HTMLDivElement>, i: number) {
    if (deleting) return;
    const t = e.target as HTMLElement;
    if (t.closest("button, .pic-retry")) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { from: i, over: i, x: e.clientX, y: e.clientY, moved: false };
    if (pics.length > 1) { setDragFrom(i); setDragOver(i); }
  }

  function onPicPointerMove(e: PtrEv<HTMLDivElement>) {
    const d = dragRef.current;
    if (!d || pics.length < 2) return;
    if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 10) return;
    d.moved = true;
    const hit = document.elementsFromPoint(e.clientX, e.clientY)
      .find((n): n is HTMLElement => n instanceof HTMLElement && n.dataset.picIdx != null);
    if (!hit) return;
    const over = Number(hit.dataset.picIdx);
    if (!Number.isNaN(over) && over !== d.over) {
      d.over = over;
      setDragOver(over);
    }
  }

  function onPicPointerUp() {
    const d = dragRef.current;
    dragRef.current = null;
    setDragFrom(null);
    setDragOver(null);
    if (!d || !open) return;
    if (!d.moved) { const src = pics[d.from]; if (src) setViewPic(src); return; }
    if (d.over !== d.from) void reorderPhotos(d.from, d.over);
  }

  function copyUrl() {
    void navigator.clipboard?.writeText(`${SITE_URL}/s/${shop}`).catch(() => undefined);
    show("コピーしました", "ok");
  }
  function publish() {
    if (!(contactMode === "jimoty" ? jimoty : contactMode === "line" ? lineInvite : phone).trim()) {
      const msg = `${contactMode === "jimoty" ? "Jimoty profile" : contactMode === "line" ? "LINE招待リンク" : "電話番号"}を入力してください`;
      setErr(msg); show(msg, "err"); return;
    }
    setPub("on");
    show("公開しました", "ok");
    void act({ action: "publish" }).then((ok) => { if (!ok) setPub("off"); });
  }

  async function saveSlots(next: string[]) {
    const body = await act({ action: "slots", slots: next }, "保存しました");
    if (body?.slots) setSlots(body.slots as string[]);
  }
  async function saveSpots(next: PickupSpot[]) {
    const body = await act({ action: "spots", pickupSpots: next }, "保存しました");
    if (body?.pickupSpots) setSpots(body.pickupSpots as PickupSpot[]);
    else if (body) setSpots(next);
  }

  async function saveDates(from: string, to: string, lead = leadDays) {
    const body = await act({ action: "dates", pickupFrom: from, pickupTo: to, moveOut: to, leadDays: lead }, "保存しました");
    if (!body) return;
    setPickupFrom(String(body.pickupFrom || from));
    setPickupTo(String(body.pickupTo || body.moveOut || to));
    if (body.leadDays != null) setLeadDays(Number(body.leadDays));
  }
  async function saveMins(n = minItems, y = minTotal) {
    const body = await act({ action: "mins", minItems: n, minTotal: y }, "保存しました");
    if (!body) return;
    setMinItems(Number(body.minItems) || 0);
    setMinTotal(Number(body.minTotal) || 0);
  }
  function openClaim(id: string) {
    const c = (data?.claims || []).find((x) => x.id === id);
    setPane(null); setRsOk(false); setKeep(c ? [...c.itemIds] : []); setClaimId(id);
  }
  function closeClaim() { setPane(null); setRsOk(false); setKeep([]); setClaimId(null); }
  function openResched(c: Claim) {
    setRsDay(c.day || rsDays[0] || "");
    setRsSlot(c.slot || null); setRsOk(false); setPane("resched");
  }
  function toggleKeep(id: string) {
    setKeep((k) => (k.includes(id) ? (k.length <= 1 ? k : k.filter((x) => x !== id)) : [...k, id]));
  }
  /** Like publish / photo-delete: dismiss + snack first; local patch then snap. */
  function claimAct(payload: Record<string, unknown>, okMsg: string) {
    const id = String(payload.id || "");
    const prev = data;
    const nextIds = Array.isArray(payload.itemIds) ? payload.itemIds.map(String) : null;
    if (payload.action === "reschedule") {
      const day = String(payload.day || ""), slot = String(payload.slot || "");
      setData((d) => d && { ...d, claims: d.claims.map((c) => (c.id === id ? { ...c, day, slot } : c)) });
    } else {
      const st = payload.action === "items" ? null
        : payload.action === "confirm" ? "booked"
          : payload.action === "picked_up" ? "picked_up" : "cancelled";
      setData((d) => d && {
        ...d,
        claims: d.claims.map((c) => (c.id !== id ? c : {
          ...c, ...(st ? { status: st } : {}), ...(nextIds ? { itemIds: nextIds } : {}),
        })),
        items: d.items.map((it) => {
          if (it.claimId !== id) return it;
          if (st === "cancelled" || (nextIds && !nextIds.includes(it.id))) return { ...it, claimId: null };
          return st === "booked" ? { ...it, claimId: id } : it;
        }),
      });
    }
    closeClaim(); show(okMsg, "ok");
    void adminAct(shop, payload).catch((e) => {
      const msg = e instanceof Error ? e.message : "失敗しました";
      setErr(msg); show(msg, "err"); if (prev) setData(prev);
    });
  }

  const busyOpen = open ? deleting === open.id : false;
  useBodyScrollLock(!!openId || !!claimId);
  const editMask = useMaskDismiss(closeEdit, busyOpen);
  const empty = !!data && !items.length;
  const areaN = Math.max(2, Array.from(addrDraft || "目黒").length);

  return (
    <main className="buy admin">
      <header className="bar admin-bar">
        <span className="shop" aria-label="ショップ名">{label || "Admin"}</span>
        <label className="area-float" aria-label="区">
            <input value={addrDraft} disabled={!data} size={areaN}
            style={{ width: `${areaN}em` }}
            onChange={(e) => onAddressChange(e.target.value)}
            placeholder="目黒" autoComplete="address-level2" />
          <span aria-hidden="true">区</span>
        </label>
        <span className="spacer" aria-hidden="true" />
        {logged && pub === "on" && <button type="button" className="share" onClick={copyUrl}>URLコピー</button>}
        <button type="button" className="req"
          onClick={!logged ? () => router.push("/me") : pub === "on" ? () => router.push(`/s/${shop}`) : publish}>
          {!logged ? "ログインして保存" : pub === "on" ? "見る" : "公開する"}
        </button>
      </header>

      {err && <div className="err">{err}</div>}
      {!data && !err && <p className="text-sm text-muted pad">読み込み中…</p>}

      {([["依頼", requests], ["引き取り予定", pending]] as const).map(([title, list]) => (list.length > 0 || (title === "引き取り予定" && hasDone)) && (
        <section key={title} className="claims">
          <div className="claims-h">{title}</div>
          {title === "引き取り予定" && hasDone && (
            <label className="late-check"><input type="checkbox" checked={showDone}
              onChange={(e) => setShowDone(e.target.checked)} />完了済みを表示</label>
          )}
          {list.length > 0 && (
            <ol className="timeline">
              {list.map((c) => <ClaimRow key={c.id} c={c} items={data?.items || []} onOpen={openClaim} />)}
            </ol>
          )}
        </section>
      ))}

      <section className="prof-block">
        <label className="float"><span>ショップメモ</span>
          <textarea className="grow" value={bio} rows={1}
            onChange={(e) => setBio(e.target.value)}
            onBlur={() => void persistProfile(bio, jimoty, youtube)}
            placeholder="動作確認・値引き・引越し・車・まとめ買い優先など" /></label>
        <Seg label="買い手連絡" value={contactMode} onPick={(v) => setContactMode(v as ContactMode)}
          opts={[["jimoty", "ジモティー"], ["line", "LINE"], ["phone", "電話"]]} />
        {contactMode !== "jimoty" && (
          <label className="float"><span>{contactMode === "line" ? "LINE招待リンク" : "電話番号"}</span>
            <input value={contactMode === "line" ? lineInvite : phone}
              onChange={(e) => (contactMode === "line" ? setLineInvite : setPhone)(e.target.value)}
              onBlur={() => void persistProfile(bio, jimoty, youtube, lineInvite, phone)}
              placeholder={contactMode === "line" ? "https://line.me/ti/p/…" : "080-0000-0000"}
              inputMode={contactMode === "line" ? "url" : "tel"}
              autoComplete={contactMode === "line" ? "off" : "tel"} /></label>
        )}
      </section>

      {empty && contactMode === "jimoty" && (
        <div className="jm-hero">
          {!jmPrev && !jmCands.length && (
            <>
              <input value={jmDraft} disabled={jmBusy || !data}
                placeholder="ジモティ名" aria-label="ジモティ名"
                onChange={(e) => setJmDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void lookupJimoty(); } }}
                autoComplete="nickname" />
              <button type="button" className="cta" disabled={jmBusy || !data}
                onClick={() => void lookupJimoty()}>
                {jmBusy ? "検索中…" : "ジモティーから取り込む"}
              </button>
            </>
          )}
          {jmCands.length > 0 && (
            <div className="jm-prev">
              <p className="hint">どれですか？</p>
              {jmCands.map((c) => (
                <button key={c.id} type="button" className="jm-cand" disabled={jmBusy}
                  onClick={() => { setJmPrev(c); setJmCands([]); }}>
                  <b>{c.name}さん</b>
                  <span>{c.samples.map((s) => s.name).filter(Boolean).slice(0, 2).join(" · ") || c.url}</span>
                </button>
              ))}
              <button type="button" className="share" disabled={jmBusy}
                onClick={() => setJmCands([])}>もどる</button>
            </div>
          )}
          {jmPrev && (
            <div className="jm-prev">
              <p className="jm-who"><b>{jmPrev.name}さん</b> — 本人確認用のサンプル</p>
              <p className="hint">これは全件ではありません。確認後に受付中の出品をまとめて取り込みます。</p>
              <ul className="jm-samples">
                {jmPrev.samples.map((s) => (
                  <li key={s.url || s.name}>
                    {s.photo ? <img src={s.photo} alt="" /> : <span className="jm-ph" aria-hidden="true" />}
                    <span>{s.name}{s.price ? ` · ¥${s.price.toLocaleString("ja-JP")}` : ""}</span>
                  </li>
                ))}
              </ul>
              <button type="button" className="cta" disabled={jmBusy}
                onClick={() => void confirmJimoty(jmPrev)}>
                {jmBusy ? "取込中…" : "この人で取り込む"}
              </button>
              <button type="button" className="share" disabled={jmBusy}
                onClick={() => setJmPrev(null)}>もどる</button>
            </div>
          )}
        </div>
      )}
      <div className="add-dual">
        <button type="button" className="cta"
          disabled={!data || listBusy}
          onClick={() => {
            setListOpen((v) => {
              if (v) { setListDraft(""); return false; }
              setListDraft("");
              requestAnimationFrame(() => listRef.current?.focus());
              return true;
            });
          }}>リスト入力</button>
        <button type="button" className="cta"
          disabled={!data}
          onClick={() => { setCamItemId(null); setCamOpen(true); }}>
          <Icon name="camera" size={18} />写真入力
        </button>
        {listOpen && (
          <div className="list-row">
            <input ref={listRef} value={listDraft} disabled={listBusy}
              placeholder="品名" aria-label="品名"
              onChange={(e) => setListDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void onListEnter(); } }} />
            <span className="list-hint" aria-hidden="true">
              {listDraft.trim() ? "Enterで追加" : "Enterで完了"}
            </span>
          </div>
        )}
      </div>

      {empty && shop !== ELTON_SHOP && data && (
        <p className="hint">
          <button type="button" className="share" disabled={delShopBusy}
            onClick={() => void deleteEmptyShop()}>
            {delShopBusy ? "削除中…" : "このショップを削除"}
          </button>
        </p>
      )}

      {!empty && (
        <p className="hint jm-muse">
          <a href="https://muse.ai" target="_blank" rel="noopener noreferrer">Muse AI</a>
          なら、ここの出品をジモティへ自動掲載・定期同期・メッセージ返信もできます。開始プロンプトをコピーして貼り付けて。
          <button type="button" className="share" onClick={() => {
            void navigator.clipboard?.writeText(musePrompt(shop, bio, items)).catch(() => undefined);
            show("コピーしました", "ok");
          }}>コピー</button>
          <span className="save-more">
            <IconBtn name="more" label="その他" size={20}
              onClick={() => { setJmMore((v) => !v); setWipeTyped(null); }} />
            {jmMore && (
              <div className={`menu-pop${wipeTyped != null ? " pane" : ""}`}>
                {wipeTyped == null ? (
                  <button type="button" className="danger" disabled={jmWipeBusy || !data}
                    onClick={() => {
                      if (!(items.some((i) => i.jimoty) || items.length)) {
                        show("削除する出品がありません", "err"); setJmMore(false); return;
                      }
                      setWipeTyped("");
                    }}>
                    取り込んだ出品を削除
                  </button>
                ) : (
                  <>
                    <p className="hint">{items.filter((i) => i.jimoty).length
                      ? `取り込み分 ${items.filter((i) => i.jimoty).length}件（手入力は残る）。OK と入力`
                      : `全出品 ${items.length}件。OK と入力`}</p>
                    <input value={wipeTyped} placeholder="OK" aria-label="OK と入力" autoFocus
                      onChange={(e) => setWipeTyped(e.target.value)} />
                    <button type="button" className="danger"
                      disabled={wipeTyped !== "OK" || jmWipeBusy}
                      onClick={() => { void wipeJimotyImport(); setJmMore(false); setWipeTyped(null); }}>
                      {jmWipeBusy ? "削除中…" : "削除する"}
                    </button>
                  </>
                )}
              </div>
            )}
          </span>
        </p>
      )}
      <SquareCam open={camOpen} accept={IMG_ACCEPT}
        tip={camItemId ? undefined : "1枚＝1出品。名前はあとで。"}
        sharp={!!camItemId}
        onClose={() => { setCamOpen(false); setCamItemId(null); }}
        onShot={(file) => {
          if (camItemId) queueAppend(camItemId, [file]);
          else addFromPhotos([file]);
        }} />

      {!empty && (
        <>
          <ListingTools dir={priceDir} onDir={setPriceDir} dense={dense} onDense={setDense}
            showSold={showSold} onShowSold={setShowSold} />
          <Listings items={listItems} dense={dense} onSelect={openDetail}
            disabledFor={(it) => deleting === it.id}
            classNameFor={(it) => {
              const f = data ? itemFlags(data as Store, it) : null;
              return `${deleting === it.id || it.paused ? "dim" : ""}${f?.sold ? " sold" : f?.taken ? " booked" : ""}`.trim();
            }} />
        </>
      )}

      <section className="prof-block">
        <div className="slot-add">
          <DateField label="受取開始" value={pickupFrom} onChange={(v) => { setPickupFrom(v); void saveDates(v, pickupTo); }} />
          <span aria-hidden="true">〜</span>
          <DateField label="退去日" value={pickupTo} onChange={(v) => { setPickupTo(v); void saveDates(pickupFrom, v); }} />
        </div>
        <label className="float lead"><span>最短予約</span>
          <span className="lead-row">
            <input type="number" min={0} inputMode="numeric" aria-label="最短予約（日前）"
              value={leadDays}
              onChange={(e) => setLeadDays(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
              onBlur={() => void saveDates(pickupFrom, pickupTo, leadDays)} />
            <span aria-hidden="true">日前</span>
          </span>
        </label>
        <div className="slot-edit" role="list" aria-label="受取時間">
          {slots.map((s) => (
            <button key={s} type="button" className="slot" role="listitem"
              aria-label={`${s}を削除`}
              onClick={() => {
                if (slots.length <= 1) { show("時間帯は1つ以上必要です", "err"); return; }
                void saveSlots(slots.filter((x) => x !== s));
              }}>{s} ×</button>
          ))}
          <span className="slot-add-wrap">
            <button type="button" className="slot" onClick={() => setSlotOpen((v) => !v)}>時間を追加</button>
            {slotOpen && (
              <div className="slot-pop" role="dialog" aria-label="時間を追加">
                <input type="time" aria-label="開始" value={slotA} onChange={(e) => setSlotA(e.target.value)} />
                <span aria-hidden="true">〜</span>
                <input type="time" aria-label="終了" value={slotB} onChange={(e) => setSlotB(e.target.value)} />
                <button type="button" className="slot" disabled={!slotA || !slotB || slotB <= slotA}
                  onClick={() => {
                    const label = fmtSlot(slotA, slotB);
                    if (slots.includes(label)) { show("すでにあります", "err"); return; }
                    void saveSlots([...slots, label].sort());
                    setSlotOpen(false);
                  }}>追加</button>
              </div>
            )}
          </span>
        </div>
        <div className="spot-edit" aria-label="受取場所">
          {spots.map((sp) => (
            <div key={sp.id} className="spot-row">
              <input aria-label="場所名" value={sp.name} placeholder="場所名"
                onChange={(e) => setSpots((all) => all.map((x) => x.id === sp.id ? { ...x, name: e.target.value } : x))}
                onBlur={(e) => {
                  const next = spots.map((x) => x.id === sp.id ? { ...x, name: e.target.value } : x).filter((x) => x.name.trim());
                  setSpots(next); void saveSpots(next);
                }} />
              <input aria-label="Maps URL" value={sp.mapsUrl} placeholder="Google Maps URL" inputMode="url"
                onChange={(e) => setSpots((all) => all.map((x) => x.id === sp.id ? { ...x, mapsUrl: e.target.value } : x))}
                onBlur={(e) => {
                  const next = spots.map((x) => x.id === sp.id ? { ...x, mapsUrl: e.target.value } : x).filter((x) => x.name.trim());
                  setSpots(next); void saveSpots(next);
                }} />
              <button type="button" className="spot-x" aria-label={`${sp.name || "場所"}を削除`}
                onClick={() => void saveSpots(spots.filter((x) => x.id !== sp.id))}>×</button>
            </div>
          ))}
          <button type="button" className="slot" onClick={() => setSpots((s) => [...s, { id: uid("p"), name: "", mapsUrl: "" }])}>場所を追加</button>
          {shop === ELTON_SHOP && (
            <div className="slot-edit" role="group" aria-label="場所の候補">
              {ELTON_SPOTS.filter((s) => !spots.some((x) => x.name === s.name)).map((s) => (
                <button key={s.name} type="button" className="slot"
                  onClick={() => void saveSpots([...spots.filter((x) => x.name.trim()), { id: uid("p"), name: s.name, mapsUrl: s.mapsUrl }])}>{s.name}</button>
              ))}
            </div>
          )}
        </div>
        <details className="opt">
          <summary>任意</summary>
          <div className="name-price">
            <label className="float"><span>Jimoty profile</span>
              <input value={jimoty} onChange={(e) => setJimoty(e.target.value)}
                onBlur={() => void persistProfile(bio, jimoty, youtube)}
                placeholder="https://jmty.jp/…" inputMode="url" autoComplete="url" /></label>
            <label className="float"><span>内見動画</span>
              <input value={youtube} onChange={(e) => setYoutube(e.target.value)}
                onBlur={() => void persistProfile(bio, jimoty, youtube)}
                placeholder="内見動画URL" inputMode="url" autoComplete="url" /></label>
          </div>
          <div className="name-price">
            <label className="float lead"><span>最低点数</span>
              <span className="lead-row">
                <input type="number" min={0} inputMode="numeric" aria-label="最低点数（0でなし）"
                  value={minItems}
                  onChange={(e) => setMinItems(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
                  onBlur={() => void saveMins()} />
                <span aria-hidden="true">点</span>
              </span>
            </label>
            <label className="float lead"><span>最低合計</span>
              <span className="lead-row">
                <input type="number" min={0} inputMode="numeric" aria-label="最低合計円（0でなし）"
                  value={minTotal}
                  onChange={(e) => setMinTotal(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
                  onBlur={() => void saveMins()} />
                <span aria-hidden="true">円</span>
              </span>
            </label>
          </div>
        </details>
      </section>

      {(data?.claims || []).some((c) => c.status === "picked_up") && (
        <p className="hint thanks pad">ありがとう。ほかの小さなアプリも →{" "}
          <a className="linelink" href="https://linelton.dev" target="_blank" rel="noopener noreferrer">linelton.dev</a></p>
      )}

      {claimOpen && (
        <div className="mask" role="dialog" aria-modal="true" aria-label="予約詳細"
          onClick={closeClaim}>
          <div className="sheet claim-sheet" onClick={(e) => e.stopPropagation()}>
            <p className="tl-when">{dayLbl(claimOpen.day)} {claimOpen.slot || "—"}{claimOpen.status === "picked_up" ? " · 完了" : ""}</p>
            {claimWho(claimOpen) ? <p className="hint">{claimWho(claimOpen)}</p> : null}
            {claimOpen.contactMethod ? <div className="text-sm text-muted" style={{ marginBottom: 8 }}>{methodJa(claimOpen.contactMethod)}</div> : null}
            {claimOpen.spotName ? (
              <p className="hint" style={{ marginBottom: 8 }}>
                {claimOpen.spotMapsUrl
                  ? <a className="linelink" href={claimOpen.spotMapsUrl} target="_blank" rel="noopener noreferrer">{claimOpen.spotName}</a>
                  : claimOpen.spotName}
              </p>
            ) : null}
            <ul className="claim-items" aria-label="依頼の品目">
              {claimList.map((it) => (
                <li key={it.id}>
                  <label className="late-check claim-keep">
                    <input type="checkbox" checked={keep.includes(it.id)}
                      disabled={keep.length <= 1 && keep.includes(it.id)}
                      onChange={() => toggleKeep(it.id)} />
                    <span>{itemLabel(it)}</span>
                  </label>
                  {it.price != null ? <span className="text-sm text-muted">¥{it.price.toLocaleString("ja-JP")}</span> : null}
                </li>
              ))}
            </ul>
            {claimOpen.offer != null ? (
              <p className="total">希望額 ¥{claimOpen.offer.toLocaleString("ja-JP")}</p>
            ) : null}
            {claimOpen.status === "requested" && pane === "decline" ? (
              <div className="decline-list" role="group" aria-label="お断り理由">
                <p className="hint">丁寧なお断り文を選んでください</p>
                {DECLINE_PRESETS.map((t) => (
                  <button key={t} type="button" className="decline-opt"
                    onClick={() => claimAct({ action: "cancel", id: claimOpen.id, reason: t }, "お断りしました")}>{t}</button>
                ))}
                <button type="button" className="decline-back" onClick={() => setPane(null)}>戻る</button>
              </div>
            ) : (claimOpen.status === "requested" || claimOpen.status === "booked") && pane === "resched" ? (
              <div className="decline-list" role="group" aria-label="日程変更">
                <div className="when">
                  <span className="date-ctl"><select value={rsDay} aria-label="日付"
                    onChange={(e) => { setRsDay(e.target.value); setRsSlot(null); }}>
                    {rsOpts.map((d) => <option key={d} value={d}>{dayLbl(d)}</option>)}
                  </select></span>
                  <div className="slots" role="group" aria-label="時間帯">
                    {slots.map((s) => (
                      <button key={s} type="button" aria-pressed={rsSlot === s}
                        className={rsSlot === s ? "slot on" : "slot"} onClick={() => setRsSlot(s)}>{s}</button>
                    ))}
                  </div>
                </div>
                <label className="late-check"><input type="checkbox" checked={rsOk}
                  onChange={(e) => setRsOk(e.target.checked)} />チャットで合意済み</label>
                <button type="button" className={`cta${rsOk && rsDay && rsSlot ? " go" : ""}`}
                  disabled={!rsOk || !rsDay || !rsSlot}
                  onClick={() => claimAct({ action: "reschedule", id: claimOpen.id, day: rsDay, slot: rsSlot, agreed: true }, "日程を変更しました")}>変更する</button>
                <button type="button" className="decline-back" onClick={() => setPane(null)}>戻る</button>
              </div>
            ) : (
              <div className="claim-acts">
                {keepDirty ? (
                  <button type="button"
                    onClick={() => claimAct({ action: "items", id: claimOpen.id, itemIds: keep }, "品目を更新しました")}>品目を更新</button>
                ) : null}
                {claimOpen.status === "requested" ? (
                  <>
                    <button type="button" onClick={() => setPane("decline")}>お断り</button>
                    <button type="button" onClick={() => openResched(claimOpen)}>日程変更</button>
                    <button type="button"
                      onClick={() => claimAct({ action: "confirm", id: claimOpen.id, itemIds: keep }, "確認しました")}>確認する</button>
                  </>
                ) : claimOpen.status === "booked" ? (
                  <>
                    <button type="button"
                      onClick={() => claimAct({ action: "cancel", id: claimOpen.id }, "キャンセルしました")}>キャンセル</button>
                    <button type="button" onClick={() => openResched(claimOpen)}>日程変更</button>
                    <button type="button"
                      onClick={() => claimAct({ action: "picked_up", id: claimOpen.id, itemIds: keep }, "受取済み")}>受取済み</button>
                  </>
                ) : null}
              </div>
            )}
          </div>
        </div>
      )}

      {open && (
        <div className="mask" role="dialog" aria-modal="true" aria-label="品目を編集" {...editMask}>
          <div className="sheet edit" onClick={(e) => { e.stopPropagation(); if (itemMenu) setItemMenu(false); }}>
            <div className="pics">
              {pics.map((src, i) => {
                const st = picBusy[src];
                return (
                  <div key={src} data-pic-idx={i}
                    className={`pic-wrap${pics.length > 1 ? " sortable" : ""}${dragFrom === i ? " dragging" : ""}${dragOver === i && dragFrom !== i ? " drag-over" : ""}${st === "uploading" ? " uploading" : ""}${st === "error" ? " error" : ""}`}
                    onPointerDown={(e) => onPicPointerDown(e, i)}
                    onPointerMove={onPicPointerMove}
                    onPointerUp={onPicPointerUp}
                    onPointerCancel={onPicPointerUp}>
                    <img src={src} alt="" loading="lazy" decoding="async" draggable={false} />
                    {st === "uploading" && <span className="pic-status" aria-label="アップロード中">…</span>}
                    {st === "error" && <button type="button" className="pic-retry" onClick={() => retryPic(src)}>再試行</button>}
                  </div>
                );
              })}
              <button type="button" className={`pic-add${busyOpen ? " busy" : ""}`} aria-label="写真を追加"
                disabled={busyOpen} onClick={(e) => { e.stopPropagation(); setCamItemId(open.id); setCamOpen(true); }}>
                <Icon name="plus" size={18} />
              </button>
            </div>
            <div className="name-price">
              <label className="float"><span>名前</span>
                <input value={editName} disabled={busyOpen}
                  onChange={(e) => patchEdit("name", e.target.value)} /></label>
              <label className="float price"><span>価格</span>
                <input type="number" min={0} inputMode="numeric" value={editPrice} disabled={busyOpen}
                  onChange={(e) => patchEdit("price", e.target.value)} /></label>
            </div>
            <label className="float">
              <span>メモ</span>
              <textarea className="grow" value={editNote} disabled={busyOpen} rows={1}
                onChange={(e) => patchEdit("note", e.target.value)} />
            </label>
            <button type="button" className="cta soft" disabled={busyOpen}
              onClick={() => void togglePause(open)}>
              {open.paused ? "再開" : "一時停止"}
            </button>
            <div className="save-row" onClick={(e) => e.stopPropagation()}>
              <div className="save-more">
                <IconBtn name="more" label="品目メニュー" disabled={busyOpen} size={24} className="more"
                  onClick={() => setItemMenu((v) => !v)} />
                {itemMenu && (
                  <div className="menu-pop up">
                    <button type="button" className="danger" disabled={busyOpen}
                      onClick={() => { setItemMenu(false); void deleteItem(open); }}>
                      <Icon name="trash" size={16} /> 品目を削除
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      {viewPic && open && (
        <div className="mask lb" role="dialog" aria-modal="true" aria-label="写真" onClick={() => setViewPic(null)}>
          <img src={viewPic} alt="" onClick={(e) => e.stopPropagation()} />
          <button type="button" className="cta soft" disabled={busyOpen}
            onClick={(e) => { e.stopPropagation(); void deletePhoto(open, viewPic); }}>削除</button>
        </div>
      )}
      <Snack snack={snack} />
    </main>
  );
}
