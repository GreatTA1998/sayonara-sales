"use client";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type PointerEvent as PtrEv } from "react";
import { useRouter } from "next/navigation";
import { DateField, Icon, IconBtn } from "@/components/icons";
import { byPrice, Listings, ListingTools, Seg, useDense, usePriceDir, type PhotoItem } from "@/components/photo-listing";
import SquareCam from "@/components/square-cam";
import { Snack, useMaskDismiss, useSnack } from "@/components/snack";
import { compressImage, ensureImageFile, isImageFile } from "@/lib/compress";
import { dayLbl } from "@/lib/days";
import { DECLINE_PRESETS, DEF_LEAD, PICKUP_DAYS, PICKUP_SLOTS, ytUrl } from "@/lib/sale";
import { adminAct, listenShop } from "@/lib/live";
import { getName, getProfile, saveProfile, subscribeAuth } from "@/lib/shop";
import { shopMins, shopPublished, type Store } from "@/lib/store";
import { SITE_URL } from "@/lib/site";

type Item = PhotoItem & { claimId?: string | null; note?: string; paused?: boolean };
type Claim = {
  id: string; code: string; day: string; slot?: string; contact?: string; contactMethod?: string;
  itemIds: string[]; status: string;
};
type AdminState = {
  address: string; bio?: string; jimotyUrl?: string; youtubeUrl?: string;
  lineInviteUrl?: string; phone?: string; slots?: string[];
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
const methodJa = (m?: string) => (m === "jimoty" ? "Jimoty" : m === "phone" ? "電話" : m === "line" ? "LINE" : m || "");
const kuStem = (v: string) => v.replace(/区$/, "");
const kuFull = (v: string) => { const s = kuStem(v).trim(); return s ? `${s}区` : ""; };
const itemLabel = (it?: Item | null) => it?.name?.trim() || "無題";
const isRemote = (u: string) => /^https?:\/\//i.test(u);
const tempId = () => `tmp-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
type PicStatus = "uploading" | "error";
type PicJob = { file: File; itemId: string; kind: "append" | "create" };
function claimItems(c: Claim, all: Item[]) {
  return c.itemIds
    .map((id) => all.find((i) => i.id === id) || { id, name: "無題", price: null as number | null })
    .sort(byPrice("desc"));
}
const claimSummary = (c: Claim, all: Item[]) => {
  const list = claimItems(c, all);
  return list.length <= 1 ? `1点 · ${itemLabel(list[0])}` : `${list.length}点 · ${itemLabel(list[0])}…`;
};
const claimWhen = (c: Claim) => [c.contact && c.contact !== "LINE" && c.contact !== "Jimoty" ? c.contact : "", `${dayLbl(c.day)}${c.slot ? ` ${c.slot}` : ""}`].filter(Boolean).join(" · ");

export default function ShopAdminView({ shop, name }: Props) {
  const router = useRouter();
  const [data, setData] = useState<AdminState | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [listBusy, setListBusy] = useState(false);
  const [picBusy, setPicBusy] = useState<Record<string, PicStatus>>({});
  const picJobs = useRef<Record<string, PicJob>>({});
  const [deleting, setDeleting] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPrice, setEditPrice] = useState("0");
  const [editNote, setEditNote] = useState("");
  const [itemMenu, setItemMenu] = useState(false);
  const [viewPic, setViewPic] = useState<string | null>(null);
  const [claimId, setClaimId] = useState<string | null>(null);
  const [decline, setDecline] = useState(false);
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

  const items = useMemo(() => {
    const all = data?.items || [];
    const cmp = byPrice(priceDir);
    const pending = all.filter((i) => i.id.startsWith("tmp-"));
    const rest = all.filter((i) => !i.id.startsWith("tmp-")).sort(cmp);
    return pending.length ? [...pending, ...rest] : [...all].sort(cmp);
  }, [data?.items, priceDir]);
  const open = useMemo(() => items.find((i) => i.id === openId) || null, [items, openId]);
  const active = useMemo(
    () => (data?.claims || []).filter((c) => c.status === "requested" || c.status === "booked"),
    [data?.claims],
  );
  const claimOpen = useMemo(() => active.find((c) => c.id === claimId) || null, [active, claimId]);
  const requests = active.filter((c) => c.status === "requested");
  const pending = active.filter((c) => c.status === "booked");
  const claimList = useMemo(
    () => (claimOpen && data ? claimItems(claimOpen, data.items) : []),
    [claimOpen, data],
  );
  function apply(action: string, payload: Record<string, unknown>, body: Record<string, unknown>) {
    setData((d) => {
      if (!d) return d;
      if (action === "add") return { ...d, items: [...d.items, body as unknown as Item] };
      if (action === "edit") {
        const next = body as unknown as Item;
        return {
          ...d,
          items: d.items.map((i) => (i.id === next.id ? { ...i, ...next, paused: !!next.paused } : i)),
        };
      }
      if (action === "remove") return { ...d, items: d.items.filter((i) => i.id !== payload.id) };
      if (action === "confirm" || action === "cancel" || action === "picked_up") {
        const next = body as unknown as Claim;
        const items = action === "cancel"
          ? d.items.map((i) => (i.claimId === next.id ? { ...i, claimId: null } : i))
          : d.items;
        return { ...d, items, claims: d.claims.map((c) => (c.id === next.id ? { ...c, ...next } : c)) };
      }
      return d;
    });
  }

  async function act(payload: Record<string, unknown>, okMsg?: string) {
    setErr(null);
    try {
      const body = await adminAct(shop, payload) as Record<string, unknown>;
      apply(String(payload.action), payload, body);
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
      setData((d) => d && { ...d, address: saved });
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

  function upsertItem(item: Item) {
    setData((d) => {
      if (!d) return d;
      const idx = d.items.findIndex((i) => i.id === item.id);
      if (idx < 0) return { ...d, items: [...d.items, item] };
      const items = d.items.slice();
      items[idx] = { ...items[idx], ...item };
      return { ...d, items };
    });
  }

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

  function patchPhotos(itemId: string, fn: (photos: string[]) => string[]) {
    setData((d) => {
      if (!d) return d;
      return {
        ...d,
        items: d.items.map((i) => (i.id === itemId ? { ...i, photos: fn(i.photos || []) } : i)),
      };
    });
  }

  async function postUpload(file: File, itemId?: string) {
    const compressed = await compressImage(ensureImageFile(file));
    const fd = new FormData();
    fd.set("file", compressed);
    if (itemId && !itemId.startsWith("tmp-")) fd.set("itemId", itemId);
    const res = await fetch(`/api/admin/upload?shop=${encodeURIComponent(shop)}`, { method: "POST", body: fd });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || "アップロードに失敗しました");
    return body as { url?: string; itemId?: string };
  }

  async function runPicJob(local: string) {
    const job = picJobs.current[local];
    if (!job) return;
    setPicStatus(local, "uploading");
    setErr(null);
    try {
      if (job.kind === "create") {
        const up = await postUpload(job.file);
        const remote = String(up.url || "");
        if (!remote) throw new Error("アップロードに失敗しました");
        const created = await adminAct(shop, { action: "add", name: "" }) as Item;
        await adminAct(shop, { action: "edit", id: created.id, photos: [remote] });
        const item = { ...created, photos: [remote] };
        setData((d) => {
          if (!d) return d;
          return { ...d, items: [...d.items.filter((i) => i.id !== job.itemId), item] };
        });
        if (openId === job.itemId) {
          editIdRef.current = item.id;
          setOpenId(item.id);
        }
      } else {
        const up = await postUpload(job.file, job.itemId);
        const remote = String(up.url || "");
        if (!remote) throw new Error("アップロードに失敗しました");
        let nextPhotos: string[] = [];
        setData((d) => {
          if (!d) return d;
          return {
            ...d,
            items: d.items.map((i) => {
              if (i.id !== job.itemId) return i;
              nextPhotos = (i.photos || []).map((p) => (p === local ? remote : p)).filter(isRemote);
              return { ...i, photos: (i.photos || []).map((p) => (p === local ? remote : p)) };
            }),
          };
        });
        await adminAct(shop, { action: "edit", id: job.itemId, photos: nextPhotos });
      }
      URL.revokeObjectURL(local);
      delete picJobs.current[local];
      setPicStatus(local, null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "アップロードに失敗しました";
      setErr(msg); show(msg, "err");
      setPicStatus(local, "error");
    }
  }

  function queueAppend(itemId: string, files: File[]) {
    const images = files.filter(isImageFile);
    if (!images.length) { show("画像を選択してください", "err"); return; }
    for (const file of images) {
      const local = URL.createObjectURL(file);
      picJobs.current[local] = { file, itemId, kind: "append" };
      patchPhotos(itemId, (photos) => [...photos, local]);
      void runPicJob(local);
    }
  }

  function addFromPhotos(files: File[]) {
    const images = files.filter(isImageFile);
    if (!images.length) { show("画像を選択してください", "err"); return; }
    setErr(null);
    for (const file of images) {
      const local = URL.createObjectURL(file);
      const id = tempId();
      picJobs.current[local] = { file, itemId: id, kind: "create" };
      upsertItem({ id, name: "", price: 0, photos: [local] });
      void runPicJob(local);
    }
  }

  function retryPic(local: string) {
    if (!picJobs.current[local]) return;
    void runPicJob(local);
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

  async function deleteItem(item: Item) {
    if (!confirm(`「${item.name || "無題"}」を削除しますか？`)) return;
    setDeleting(item.id); show("削除中…", "busy");
    try {
      if (item.id.startsWith("tmp-")) {
        (item.photos || []).forEach((u) => {
          if (u.startsWith("blob:")) URL.revokeObjectURL(u);
          delete picJobs.current[u];
          setPicStatus(u, null);
        });
        setData((d) => d && { ...d, items: d.items.filter((i) => i.id !== item.id) });
        if (openId === item.id) { editIdRef.current = null; editSavedRef.current = null; setOpenId(null); }
        show("削除しました", "ok");
        return;
      }
      const ok = await act({ action: "remove", id: item.id }, "削除しました");
      if (ok && (openId === item.id || editIdRef.current === item.id)) {
        if (editTimer.current) { clearTimeout(editTimer.current); editTimer.current = null; }
        editIdRef.current = null;
        editSavedRef.current = null;
        setOpenId(null);
      }
    } finally { setDeleting(null); }
  }

  async function saveRemotePhotos(itemId: string, photos: string[]) {
    if (itemId.startsWith("tmp-")) return true;
    const remotes = photos.filter(isRemote);
    try {
      await adminAct(shop, { action: "edit", id: itemId, photos: remotes });
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "失敗しました";
      setErr(msg); show(msg, "err");
      return false;
    }
  }

  async function deletePhoto(item: Item, url: string) {
    if (!confirm(`この写真を削除しますか？`)) return;
    if (url.startsWith("blob:")) {
      URL.revokeObjectURL(url);
      delete picJobs.current[url];
      setPicStatus(url, null);
      patchPhotos(item.id, (photos) => photos.filter((p) => p !== url));
      setViewPic((v) => (v === url ? null : v));
      show("写真を削除しました", "ok");
      return;
    }
    const photos = (item.photos || []).filter((p) => p !== url);
    patchPhotos(item.id, () => photos);
    setDeleting(item.id); show("削除中…", "busy");
    try {
      const ok = await saveRemotePhotos(item.id, photos);
      if (ok) setViewPic((v) => (v === url ? null : v));
      show(ok ? "写真を削除しました" : "削除に失敗しました", ok ? "ok" : "err");
    } finally { setDeleting(null); }
  }

  async function reorderPhotos(item: Item, from: number, to: number) {
    if (from === to || from < 0 || to < 0) return;
    const photos = [...(item.photos || [])];
    if (to >= photos.length) return;
    const [moved] = photos.splice(from, 1);
    photos.splice(to, 0, moved);
    upsertItem({ ...item, photos });
    await saveRemotePhotos(item.id, photos);
  }

  function onPicPointerDown(e: PtrEv<HTMLDivElement>, i: number) {
    if (deleting) return;
    const t = e.target as HTMLElement;
    if (t.closest("button, .pic-retry")) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { from: i, over: i, x: e.clientX, y: e.clientY, moved: false };
    if ((open?.photos || []).length > 1) { setDragFrom(i); setDragOver(i); }
  }

  function onPicPointerMove(e: PtrEv<HTMLDivElement>) {
    const d = dragRef.current;
    if (!d || (open?.photos || []).length < 2) return;
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
    if (!d.moved) { const src = open.photos?.[d.from]; if (src) setViewPic(src); return; }
    if (d.over !== d.from) void reorderPhotos(open, d.from, d.over);
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
  function openClaim(id: string) { setDecline(false); setClaimId(id); }
  function closeClaim() { setDecline(false); setClaimId(null); }

  const busyOpen = open ? deleting === open.id : false;
  const editMask = useMaskDismiss(closeEdit, busyOpen);
  const pics = open?.photos || [];
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

      {([["依頼", requests], ["引き取り予定", pending]] as const).map(([title, list]) => list.length > 0 && (
        <section key={title} className="claims">
          <div className="claims-h">{title}</div>
          <ol className="timeline">
            {list.map((c) => (
              <li key={c.id}>
                <button type="button" className="tl-card" onClick={() => openClaim(c.id)}>
                  <b className="tl-when">{claimWhen(c)}</b>
                  <span className="tl-sum">{claimSummary(c, data?.items || [])}</span>
                </button>
              </li>
            ))}
          </ol>
        </section>
      ))}

      <section className="prof-block">
        <label className="float"><span>ショップメモ</span>
          <textarea className="grow" value={bio} rows={1}
            onChange={(e) => setBio(e.target.value)}
            onBlur={() => void persistProfile(bio, jimoty, youtube)}
            placeholder="動作確認・値引き・引越し・車・まとめ買い優先など" /></label>
        <Seg label="買い手連絡" value={contactMode} onPick={(v) => setContactMode(v as ContactMode)}
          opts={[["jimoty", "Jimoty"], ["line", "LINE"], ["phone", "電話"]]} />
        {contactMode !== "jimoty" && (
          <label className="float"><span>{contactMode === "line" ? "LINE招待リンク" : "電話番号"}</span>
            <input value={contactMode === "line" ? lineInvite : phone}
              onChange={(e) => (contactMode === "line" ? setLineInvite : setPhone)(e.target.value)}
              onBlur={() => void persistProfile(bio, jimoty, youtube, lineInvite, phone)}
              placeholder={contactMode === "line" ? "https://line.me/ti/p/…" : "080-0000-0000"}
              inputMode={contactMode === "line" ? "url" : "tel"}
              autoComplete={contactMode === "line" ? "off" : "tel"} /></label>
        )}
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
          <ListingTools dir={priceDir} onDir={setPriceDir} dense={dense} onDense={setDense} />
          <Listings items={items} dense={dense} onSelect={openDetail}
            disabledFor={(it) => deleting === it.id}
            classNameFor={(it) => (deleting === it.id || it.paused ? "dim" : "")} />
        </>
      )}

      {(data?.claims || []).some((c) => c.status === "picked_up") && (
        <p className="hint thanks pad">ありがとう。ほかの小さなアプリも →{" "}
          <a className="linelink" href="https://linelton.dev" target="_blank" rel="noopener noreferrer">linelton.dev</a></p>
      )}

      {claimOpen && (
        <div className="mask" role="dialog" aria-modal="true" aria-label="予約詳細"
          onClick={closeClaim}>
          <div className="sheet claim-sheet" onClick={(e) => e.stopPropagation()}>
            <b className="tl-when">{claimWhen(claimOpen)}</b>
            {claimOpen.contactMethod ? <div className="text-sm text-muted" style={{ marginBottom: 8 }}>{methodJa(claimOpen.contactMethod)}</div> : null}
            <ul className="claim-items">
              {claimList.map((it) => (
                <li key={it.id}>
                  <span>{itemLabel(it)}</span>
                  {it.price != null ? <span className="text-sm text-muted">¥{it.price.toLocaleString("ja-JP")}</span> : null}
                </li>
              ))}
            </ul>
            {claimOpen.status === "requested" && decline ? (
              <div className="decline-list" role="group" aria-label="お断り理由">
                <p className="hint">丁寧なお断り文を選んでください</p>
                {DECLINE_PRESETS.map((t) => (
                  <button key={t} type="button" className="decline-opt" onClick={() => {
                    void act({ action: "cancel", id: claimOpen.id, reason: t }, "お断りしました")
                      .then((ok) => { if (ok) closeClaim(); });
                  }}>{t}</button>
                ))}
                <button type="button" className="decline-back" onClick={() => setDecline(false)}>戻る</button>
              </div>
            ) : (
              <div className="claim-acts">
                {claimOpen.status === "requested" ? (
                  <>
                    <button type="button" onClick={() => setDecline(true)}>お断り</button>
                    <button type="button" onClick={() => {
                      void act({ action: "confirm", id: claimOpen.id }, "確認しました").then((ok) => { if (ok) closeClaim(); });
                    }}>確認する</button>
                  </>
                ) : (
                  <>
                    <button type="button" onClick={() => {
                      void act({ action: "cancel", id: claimOpen.id }, "キャンセルしました").then((ok) => { if (ok) closeClaim(); });
                    }}>キャンセル</button>
                    <button type="button" onClick={() => {
                      void act({ action: "picked_up", id: claimOpen.id }, "受取済み").then((ok) => { if (ok) closeClaim(); });
                    }}>受取済み</button>
                  </>
                )}
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
