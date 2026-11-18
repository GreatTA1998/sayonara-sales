"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon, IconBtn } from "@/components/icons";
import { Listings, type PhotoItem } from "@/components/photo-listing";
import { Snack, useSnack } from "./snack";

type Item = PhotoItem & { claimId?: string | null; note?: string };
type Claim = { id: string; code: string; day: string; slot?: string; contact?: string; contactMethod?: string; itemIds: string[]; status: string };
type AdminState = { address: string; items: Item[]; claims: Claim[] };

/** Library-first: no capture (capture forces camera). Specific types bias Photos over Files. */
const IMG_ACCEPT = "image/jpeg,image/png,image/heic,image/heif,image/webp,image/gif,.jpg,.jpeg,.png,.heic,.heif,.webp,.gif";

const byPriceDesc = (a: Item, b: Item) => (b.price ?? -1) - (a.price ?? -1);
const WK = "月火水木金土日";
const dayLbl = (d: string) => {
  const [y, m, day] = d.split("-").map(Number);
  const w = WK[(new Date(Date.UTC(y, m - 1, day)).getUTCDay() + 6) % 7];
  return `${m}月${day}日（${w}）`;
};
const statusJa = (s: string) =>
  s === "booked" ? "予約済" : s === "picked_up" ? "受取済" : s === "cancelled" ? "キャンセル" : s;
const methodJa = (m?: string) => (m === "phone" ? "電話" : m === "line" ? "LINE" : m || "");

export default function AdminPage() {
  const [data, setData] = useState<AdminState | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPrice, setEditPrice] = useState("0");
  const [editNote, setEditNote] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [sheetMenu, setSheetMenu] = useState<string | null>(null); // "item" | photo url
  const { snack, show } = useSnack();
  const [addrDraft, setAddrDraft] = useState("");
  const addrDraftRef = useRef("");
  const addrTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const addrSaved = useRef("");
  const addrDirty = useRef(false);
  const addrReq = useRef(0);
  const load = useCallback(async () => {
    const res = await fetch("/api/admin", { cache: "no-store" });
    if (!res.ok) { setErr("読み込みに失敗しました"); show("読み込みに失敗しました", "err"); return; }
    setErr(null);
    const body = await res.json();
    setData(body);
    addrSaved.current = body.address || "";
    if (!addrDirty.current) {
      addrDraftRef.current = body.address || "";
      setAddrDraft(body.address || "");
    }
  }, [show]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => () => { if (addrTimer.current) clearTimeout(addrTimer.current); }, []);

  const items = useMemo(() => [...(data?.items || [])].sort(byPriceDesc), [data?.items]);
  const open = useMemo(() => items.find((i) => i.id === openId) || null, [items, openId]);

  function apply(action: string, payload: Record<string, unknown>, body: Record<string, unknown>) {
    setData((d) => {
      if (!d) return d;
      if (action === "add") return { ...d, items: [...d.items, body as unknown as Item] };
      if (action === "edit") {
        const next = body as unknown as Item;
        return { ...d, items: d.items.map((i) => (i.id === next.id ? { ...i, ...next } : i)) };
      }
      if (action === "remove") return { ...d, items: d.items.filter((i) => i.id !== payload.id) };
      if (action === "cancel" || action === "picked_up") {
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
    const res = await fetch("/api/admin", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await res.json();
    if (!res.ok) {
      const msg = body.error || "失敗しました";
      setErr(msg); show(msg, "err");
      return null;
    }
    apply(String(payload.action), payload, body);
    if (okMsg) show(okMsg, "ok");
    return body;
  }

  async function saveAddress(raw: string) {
    const next = raw.trim();
    if (next === addrSaved.current) return;
    const req = ++addrReq.current;
    setErr(null);
    const res = await fetch("/api/admin", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "address", address: next }),
    });
    const body = await res.json();
    if (!res.ok) {
      if (req !== addrReq.current) return;
      const msg = body.error || "失敗しました";
      setErr(msg); show(msg, "err");
      return;
    }
    if (req !== addrReq.current) return;
    const saved = String(body.address ?? next);
    addrSaved.current = saved;
    setData((d) => d && { ...d, address: saved });
    if (addrDraftRef.current.trim() === saved) addrDirty.current = false;
    show("保存しました", "ok");
  }

  function onAddressChange(value: string) {
    addrDirty.current = true;
    addrDraftRef.current = value;
    setAddrDraft(value);
    if (addrTimer.current) clearTimeout(addrTimer.current);
    addrTimer.current = setTimeout(() => { void saveAddress(value); }, 450);
  }

  function openDetail(item: Item) {
    setSheetMenu(null);
    setOpenId(item.id);
    setEditName(item.name);
    setEditPrice(String(item.price ?? 0));
    setEditNote(item.note || "");
  }

  async function saveDetail() {
    if (!open) return;
    const nextPrice = editPrice === "" ? 0 : Number(editPrice);
    const payload: Record<string, unknown> = { action: "edit", id: open.id };
    let changed = false;
    if (editName !== open.name) { payload.name = editName; changed = true; }
    if (nextPrice !== (open.price ?? 0)) { payload.price = nextPrice; changed = true; }
    if (editNote !== (open.note || "")) { payload.note = editNote.trim(); changed = true; }
    if (!changed) { setOpenId(null); return; }
    const ok = await act(payload, "保存しました");
    if (ok) setOpenId(null);
  }

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

  async function uploadPhoto(itemId: string, file: File) {
    setUploading(itemId); setErr(null); show("アップロード中…", "busy");
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("itemId", itemId);
      const res = await fetch("/api/admin/upload", { method: "POST", body: fd });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "アップロードに失敗しました");
      if (body.item) upsertItem(body.item as Item);
      else {
        const photos = Array.isArray(body.photos) ? body.photos.map(String) : [];
        setData((d) => d && {
          ...d,
          items: d.items.map((i) => (i.id === itemId ? { ...i, photos } : i)),
        });
      }
      show("写真を追加しました", "ok");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "アップロードに失敗しました";
      setErr(msg); show(msg, "err");
    } finally { setUploading(null); }
  }

  async function addFromPhotos(files: File[]) {
    const images = files.filter((f) => f.type.startsWith("image/"));
    if (!images.length) return;
    setAddOpen(false);
    setUploading("batch"); setErr(null);
    let ok = 0;
    show(`アップロード中 0/${images.length}…`, "busy");
    for (let i = 0; i < images.length; i++) {
      try {
        const fd = new FormData();
        fd.set("file", images[i]);
        const res = await fetch("/api/admin/upload", { method: "POST", body: fd });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || "アップロードに失敗しました");
        if (body.item) upsertItem(body.item as Item);
        ok++;
        show(`アップロード中 ${ok}/${images.length}…`, "busy");
      } catch (e) {
        const msg = e instanceof Error ? e.message : "アップロードに失敗しました";
        setErr(msg); show(msg, "err");
      }
    }
    setUploading(null);
    if (ok) show(ok === 1 ? "品目を追加しました" : `${ok}件追加しました`, "ok");
  }

  async function deleteItem(item: Item) {
    if (!confirm(`「${item.name || "無題"}」を削除しますか？`)) return;
    setDeleting(item.id); show("削除中…", "busy");
    try {
      const ok = await act({ action: "remove", id: item.id });
      if (ok && openId === item.id) setOpenId(null);
      show(ok ? "削除しました" : "削除に失敗しました", ok ? "ok" : "err");
    } finally { setDeleting(null); }
  }

  async function deletePhoto(item: Item, url: string) {
    if (!confirm(`この写真を削除しますか？`)) return;
    const photos = (item.photos || []).filter((p) => p !== url);
    setDeleting(item.id); show("削除中…", "busy");
    try {
      const ok = await act({ action: "edit", id: item.id, photos });
      show(ok ? "写真を削除しました" : "削除に失敗しました", ok ? "ok" : "err");
    } finally { setDeleting(null); }
  }

  const busyOpen = open ? deleting === open.id : false;
  const pics = open?.photos || [];

  return (
    <main className="buy">
      <header className="bar admin-bar">
        <span className="admin-lab" aria-label="管理ページ">管理</span>
        <input className="area-in" value={addrDraft} disabled={!data}
          size={Math.max((addrDraft || "下目黒").length + 1, 3)}
          onChange={(e) => onAddressChange(e.target.value)} aria-label="エリア" placeholder="下目黒" />
        <span className="spacer" aria-hidden="true" />
        <IconBtn name="plus" label="品目を追加" size={22}
          disabled={!data || uploading === "batch"}
          onClick={() => setAddOpen(true)} className="solid" />
      </header>
      {err && <div className="err">{err}</div>}
      {!data && !err && <p style={{ padding: 12, color: "#555" }}>読み込み中…</p>}
      <Listings items={items} onSelect={openDetail}
        disabledFor={(it) => deleting === it.id}
        classNameFor={(it) => (deleting === it.id ? "dim" : "")} />
      {!items.length && data && <p style={{ padding: 12, color: "#777" }}>品目がありません</p>}

      <section style={{ padding: "12px 8px 24px" }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>予約</div>
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {(data?.claims || []).map((c) => {
            const names = c.itemIds
              .map((id) => data?.items.find((i) => i.id === id)?.name?.trim() || "無題")
              .join("、");
            const contact = [
              methodJa(c.contactMethod),
              c.contact && c.contact !== "LINE" ? c.contact : "",
            ].filter(Boolean).join(" · ");
            return (
              <li key={c.id} style={{ padding: "8px 0", borderBottom: "1px solid #eee", fontSize: 13 }}>
                <div>
                  <b>{dayLbl(c.day)}</b>
                  {c.slot ? ` · ${c.slot}` : ""}
                  {names ? ` · ${names}` : ""}
                </div>
                <div style={{ color: "#888", fontSize: 12, marginTop: 2 }}>
                  {statusJa(c.status)}
                  {contact ? ` · ${contact}` : ""}
                </div>
                {c.status === "booked" && (
                  <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                    <button type="button" onClick={() => act({ action: "cancel", id: c.id }, "保存しました")}>キャンセル</button>
                    <button type="button" onClick={() => act({ action: "picked_up", id: c.id }, "保存しました")}>受取済み</button>
                  </div>
                )}
              </li>
            );
          })}
          {!data?.claims?.length && <li style={{ color: "#777" }}>予約はまだありません</li>}
        </ul>
      </section>

      {addOpen && (
        <div className="mask" role="dialog" aria-modal="true" aria-label="品目を追加"
          onClick={() => setAddOpen(false)}>
          <div className="sheet add-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="add-head">
              <h2>品目を追加</h2>
              <IconBtn name="close" label="閉じる" onClick={() => setAddOpen(false)} className="ghost-border" />
            </div>
            <p className="add-cue">写真1枚につき品目が1つ作成されます。</p>
            <label className="cta" style={{ background: "#111", color: "#fff", display: "block", textAlign: "center", cursor: "pointer" }}>
              写真を追加
              <input type="file" accept={IMG_ACCEPT} multiple hidden
                onChange={(e) => { const f = e.target.files; e.target.value = ""; if (f?.length) void addFromPhotos(Array.from(f)); }} />
            </label>
          </div>
        </div>
      )}

      {open && (
        <div className="mask" role="dialog" aria-modal="true" aria-label="品目を編集"
          onClick={() => { if (!busyOpen) { setSheetMenu(null); setOpenId(null); } }}>
          <div className="sheet" onClick={(e) => { e.stopPropagation(); if (sheetMenu) setSheetMenu(null); }}
            style={{ maxHeight: "90vh", overflowY: "auto" }}>
            <div className="add-head">
              <h2 style={{ margin: 0, fontSize: 18 }}>編集</h2>
              <IconBtn name="close" label="閉じる" disabled={busyOpen} onClick={() => setOpenId(null)} className="ghost-border" />
            </div>
            <div className="pics">
              {pics.map((src) => (
                <div key={src} className="pic-wrap" onClick={(e) => e.stopPropagation()}>
                  <img src={src} alt="" loading="lazy" decoding="async" />
                  <div className="pic-more">
                    <IconBtn name="more" label="写真メニュー" disabled={busyOpen} size={16} className="ghost-border"
                      onClick={() => setSheetMenu(sheetMenu === src ? null : src)} />
                    {sheetMenu === src && (
                      <div className="menu-pop">
                        <button type="button" className="danger" disabled={busyOpen}
                          onClick={() => { setSheetMenu(null); void deletePhoto(open, src); }}>
                          <Icon name="trash" size={16} /> 写真を削除
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              <label className={`pic-add${uploading === open.id || busyOpen ? " busy" : ""}`}
                aria-label="写真を追加" onClick={(e) => e.stopPropagation()}>
                <Icon name="plus" size={22} />
                <input type="file" accept={IMG_ACCEPT} hidden disabled={busyOpen || uploading === open.id}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) uploadPhoto(open.id, f);
                  }} />
              </label>
            </div>
            <label className="float">
              <span>名前</span>
              <input value={editName} onChange={(e) => setEditName(e.target.value)} disabled={busyOpen} />
            </label>
            <label className="float">
              <span>価格</span>
              <input type="number" min={0} inputMode="numeric" value={editPrice}
                onChange={(e) => setEditPrice(e.target.value)} disabled={busyOpen} />
            </label>
            <label className="float">
              <span>メモ</span>
              <textarea value={editNote} onChange={(e) => setEditNote(e.target.value)} disabled={busyOpen} rows={3} />
            </label>
            <div className="save-row" onClick={(e) => e.stopPropagation()}>
              <button type="button" className="cta" disabled={busyOpen} onClick={() => void saveDetail()}
                style={{ background: "#111", color: "#fff", flex: 1, margin: 0 }}>保存</button>
              <div className="save-more">
                <IconBtn name="more" label="品目メニュー" disabled={busyOpen} className="ghost-border"
                  onClick={() => setSheetMenu(sheetMenu === "item" ? null : "item")} />
                {sheetMenu === "item" && (
                  <div className="menu-pop up">
                    <button type="button" className="danger" disabled={busyOpen}
                      onClick={() => { setSheetMenu(null); void deleteItem(open); }}>
                      <Icon name="trash" size={16} /> 品目を削除
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      <Snack snack={snack} />
    </main>
  );
}
