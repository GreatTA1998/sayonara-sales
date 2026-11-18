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
  const { snack, show } = useSnack();
  const [addrDraft, setAddrDraft] = useState("");
  const addrDraftRef = useRef("");
  const addrTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const addrSaved = useRef("");
  const addrDirty = useRef(false);
  const addrReq = useRef(0);
  const load = useCallback(async () => {
    const res = await fetch("/api/admin", { cache: "no-store" });
    if (!res.ok) { setErr("Failed to load"); show("Failed to load", "err"); return; }
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
      const msg = body.error || "Failed";
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
      const msg = body.error || "Failed";
      setErr(msg); show(msg, "err");
      return;
    }
    if (req !== addrReq.current) return;
    const saved = String(body.address ?? next);
    addrSaved.current = saved;
    setData((d) => d && { ...d, address: saved });
    if (addrDraftRef.current.trim() === saved) addrDirty.current = false;
    show("Saved", "ok");
  }

  function onAddressChange(value: string) {
    addrDirty.current = true;
    addrDraftRef.current = value;
    setAddrDraft(value);
    if (addrTimer.current) clearTimeout(addrTimer.current);
    addrTimer.current = setTimeout(() => { void saveAddress(value); }, 450);
  }

  function openDetail(item: Item) {
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
    const ok = await act(payload, "Saved");
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
    setUploading(itemId); setErr(null); show("Uploading…", "busy");
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("itemId", itemId);
      const res = await fetch("/api/admin/upload", { method: "POST", body: fd });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Upload failed");
      if (body.item) upsertItem(body.item as Item);
      else {
        const photos = Array.isArray(body.photos) ? body.photos.map(String) : [];
        setData((d) => d && {
          ...d,
          items: d.items.map((i) => (i.id === itemId ? { ...i, photos } : i)),
        });
      }
      show("Photo uploaded", "ok");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Upload failed";
      setErr(msg); show(msg, "err");
    } finally { setUploading(null); }
  }

  async function addFromPhotos(files: File[]) {
    const images = files.filter((f) => f.type.startsWith("image/"));
    if (!images.length) return;
    setAddOpen(false);
    setUploading("batch"); setErr(null);
    let ok = 0;
    show(`Uploading 0/${images.length}…`, "busy");
    for (let i = 0; i < images.length; i++) {
      try {
        const fd = new FormData();
        fd.set("file", images[i]);
        const res = await fetch("/api/admin/upload", { method: "POST", body: fd });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || "Upload failed");
        if (body.item) upsertItem(body.item as Item);
        ok++;
        show(`Uploading ${ok}/${images.length}…`, "busy");
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Upload failed";
        setErr(msg); show(msg, "err");
      }
    }
    setUploading(null);
    if (ok) show(ok === 1 ? "Item added" : `Added ${ok} items`, "ok");
  }

  async function deleteItem(item: Item) {
    if (!confirm(`Delete "${item.name || "item"}"?`)) return;
    setDeleting(item.id); show("Deleting…", "busy");
    try {
      const ok = await act({ action: "remove", id: item.id });
      if (ok && openId === item.id) setOpenId(null);
      show(ok ? "Item deleted" : "Delete failed", ok ? "ok" : "err");
    } finally { setDeleting(null); }
  }

  async function deletePhoto(item: Item, url: string) {
    if (!confirm(`Remove this photo from "${item.name || "item"}"?`)) return;
    const photos = (item.photos || []).filter((p) => p !== url);
    setDeleting(item.id); show("Deleting…", "busy");
    try {
      const ok = await act({ action: "edit", id: item.id, photos });
      show(ok ? "Photo removed" : "Delete failed", ok ? "ok" : "err");
    } finally { setDeleting(null); }
  }

  const busyOpen = open ? deleting === open.id : false;
  const pics = open?.photos || [];

  return (
    <main className="buy">
      <header className="bar admin-bar">
        <span className="admin-lab" aria-label="Admin page">Admin</span>
        <input className="area-in" value={addrDraft} disabled={!data}
          onChange={(e) => onAddressChange(e.target.value)} aria-label="Address" placeholder="Address" />
        <IconBtn name="plus" label="Add items" size={22}
          disabled={!data || uploading === "batch"}
          onClick={() => setAddOpen(true)} className="solid" />
      </header>
      <p style={{ margin: "6px 8px 4px", fontSize: 12, color: "#666" }}>Admin page — tap a listing to edit</p>
      {err && <div className="err">{err}</div>}
      {!data && !err && <p style={{ padding: 12, color: "#555" }}>Loading…</p>}
      <Listings items={items} onSelect={openDetail}
        disabledFor={(it) => deleting === it.id}
        classNameFor={(it) => (deleting === it.id ? "dim" : "")} />
      {!items.length && data && <p style={{ padding: 12, color: "#777" }}>No items yet</p>}

      <section style={{ padding: "12px 8px 24px" }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Claims</div>
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {(data?.claims || []).map((c) => (
            <li key={c.id} style={{ padding: "8px 0", borderBottom: "1px solid #eee", fontSize: 13 }}>
              <div><b>{c.code}</b> · {c.day.slice(5)}{c.slot ? ` · ${c.slot}` : ""} · {c.status}</div>
              <div style={{ color: "#555" }}>{c.itemIds.map((id) => data?.items.find((i) => i.id === id)?.name || id).join(", ")}{c.contactMethod ? ` · ${c.contactMethod}` : ""}{c.contact ? ` · ${c.contact}` : ""}</div>
              {c.status === "booked" && (
                <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                  <button type="button" onClick={() => act({ action: "cancel", id: c.id }, "Saved")}>Cancel</button>
                  <button type="button" onClick={() => act({ action: "picked_up", id: c.id }, "Saved")}>Picked up</button>
                </div>
              )}
            </li>
          ))}
          {!data?.claims?.length && <li style={{ color: "#777" }}>No claims yet</li>}
        </ul>
      </section>

      {addOpen && (
        <div className="mask" role="dialog" aria-modal="true" aria-label="Add items"
          onClick={() => setAddOpen(false)}>
          <div className="sheet add-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="add-head">
              <h2>Add items</h2>
              <IconBtn name="close" label="Close" onClick={() => setAddOpen(false)} className="ghost-border" />
            </div>
            <p className="add-cue">Each photo becomes its own item. Opens photo library (no camera).</p>
            <label className="cta" style={{ background: "#111", color: "#fff", display: "block", textAlign: "center", cursor: "pointer" }}>
              Add photos
              <input type="file" accept={IMG_ACCEPT} multiple hidden
                onChange={(e) => { const f = e.target.files; e.target.value = ""; if (f?.length) void addFromPhotos(Array.from(f)); }} />
            </label>
          </div>
        </div>
      )}

      {open && (
        <div className="mask" role="dialog" aria-modal="true" aria-label="Edit item"
          onClick={() => !busyOpen && setOpenId(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()} style={{ maxHeight: "90vh", overflowY: "auto" }}>
            <div className="add-head">
              <h2 style={{ margin: 0, fontSize: 18 }}>Edit</h2>
              <IconBtn name="close" label="Close" disabled={busyOpen} onClick={() => setOpenId(null)} className="ghost-border" />
            </div>
            {pics.length > 0 && (
              <div className="pics">
                {pics.map((src) => (
                  <div key={src} className="pic-wrap">
                    <img src={src} alt="" loading="lazy" decoding="async" />
                    <IconBtn name="trash" label="Delete photo" disabled={busyOpen} size={16}
                      className="danger abs" onClick={() => deletePhoto(open, src)} />
                  </div>
                ))}
              </div>
            )}
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Name</label>
            <input value={editName} onChange={(e) => setEditName(e.target.value)} disabled={busyOpen}
              style={{ width: "100%", padding: 10, marginBottom: 10, border: "1px solid #ccc", borderRadius: 8 }} />
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Price</label>
            <input type="number" min={0} inputMode="numeric" value={editPrice} onChange={(e) => setEditPrice(e.target.value)} disabled={busyOpen}
              style={{ width: "100%", padding: 10, marginBottom: 10, border: "1px solid #ccc", borderRadius: 8 }} />
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Note</label>
            <textarea value={editNote} onChange={(e) => setEditNote(e.target.value)} disabled={busyOpen} rows={3}
              style={{ width: "100%", padding: 10, marginBottom: 12, border: "1px solid #ccc", borderRadius: 8, resize: "vertical", font: "inherit" }} />
            <button type="button" className="cta" disabled={busyOpen} onClick={() => void saveDetail()}
              style={{ background: "#111", color: "#fff", marginBottom: 8 }}>Save</button>
            <label className={`icon-row${uploading === open.id || busyOpen ? " busy" : ""}`}>
              <Icon name="photo" size={18} /> {uploading === open.id ? "Uploading…" : "Add photo"}
              <input type="file" accept={IMG_ACCEPT} hidden disabled={busyOpen || uploading === open.id}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) uploadPhoto(open.id, f);
                }} />
            </label>
            <IconBtn name="trash" label="Delete item" disabled={busyOpen} className="danger block"
              onClick={() => deleteItem(open)} />
          </div>
        </div>
      )}
      <Snack snack={snack} />
    </main>
  );
}
