"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Snack, useSnack } from "./snack";

type Item = { id: string; name: string; price: number | null; claimId?: string | null; photos?: string[]; note?: string };
type Claim = { id: string; code: string; day: string; slot?: string; contact?: string; contactMethod?: string; itemIds: string[]; status: string };
type AdminState = { address: string; items: Item[]; claims: Claim[] };

const byPriceDesc = (a: Item, b: Item) => (b.price ?? -1) - (a.price ?? -1);
const money = (p: number | null) => (p == null ? "無料" : `¥${p.toLocaleString()}`);

export default function AdminPage() {
  const [data, setData] = useState<AdminState | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPrice, setEditPrice] = useState("0");
  const [editNote, setEditNote] = useState("");
  const { snack, show } = useSnack();
  const [addrDraft, setAddrDraft] = useState("");
  const addrDraftRef = useRef("");
  const addrTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const addrSaved = useRef("");
  const addrDirty = useRef(false);
  const addrReq = useRef(0);
  const addInputRef = useRef<HTMLInputElement | null>(null);

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
  const withPh = useMemo(() => items.filter((i) => (i.photos || []).length > 0), [items]);
  const noPh = useMemo(() => items.filter((i) => !(i.photos || []).length), [items]);
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
    setMenuFor(null);
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

  async function uploadPhoto(itemId: string, file: File, quiet = false) {
    setUploading(itemId); setErr(null);
    if (!quiet) show("Uploading…", "busy");
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
      if (!quiet) show("Photo uploaded", "ok");
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Upload failed";
      setErr(msg); show(msg, "err");
      return false;
    } finally {
      setUploading(null);
    }
  }

  /** + button: each selected photo becomes an untitled listing (WebP via upload API). */
  async function addFromPhotos(files: File[]) {
    const images = files.filter((f) => f.type.startsWith("image/"));
    if (!images.length) return;
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
    setMenuFor(null); setDeleting(item.id); show("Deleting…", "busy");
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

  const menuBtn = (item: Item, busy: boolean) => (
    <div style={{ position: "relative", flex: "0 0 auto" }} onClick={(e) => e.stopPropagation()}>
      <button type="button" disabled={busy} aria-label="Item menu"
        onClick={() => setMenuFor(menuFor === item.id ? null : item.id)}
        style={{ padding: "2px 8px", border: "1px solid #ccc", borderRadius: 4, background: "#fff", minWidth: 32 }}>
        {busy || uploading === item.id ? "…" : "⋮"}
      </button>
      {menuFor === item.id && !busy && (
        <div style={{ position: "absolute", right: 0, top: "100%", zIndex: 5, marginTop: 2, minWidth: 140, background: "#fff", border: "1px solid #ccc", borderRadius: 6, boxShadow: "0 4px 12px rgba(0,0,0,.12)", overflow: "hidden" }}>
          <button type="button" onClick={() => openDetail(item)}
            style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 10px", border: 0, background: "#fff", borderBottom: "1px solid #eee" }}>
            Edit
          </button>
          <label style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 10px", borderBottom: "1px solid #eee", cursor: uploading === item.id ? "wait" : "pointer", opacity: uploading === item.id ? 0.6 : 1 }}>
            {uploading === item.id ? "Uploading…" : "Add photo"}
            <input type="file" accept="image/*" hidden disabled={uploading === item.id}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                setMenuFor(null);
                if (f) uploadPhoto(item.id, f);
              }} />
          </label>
          <button type="button" onClick={() => deleteItem(item)}
            style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 10px", border: 0, background: "#fff", color: "#b00020" }}>
            Delete item
          </button>
        </div>
      )}
    </div>
  );

  return (
    <main style={S.wrap} onClick={() => menuFor && setMenuFor(null)}>
      <h1 style={S.h}>Admin</h1>
      {err && <p style={S.err}>{err}</p>}
      {!data && !err && <p style={{ color: "#555" }}>Loading…</p>}
      <section style={S.sec}><div style={S.t}>Address</div>
        <input value={addrDraft} onChange={(e) => onAddressChange(e.target.value)}
          disabled={!data} style={{ width: "100%", padding: 8 }} />
      </section>
      <section style={S.sec}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <div style={{ ...S.t, marginBottom: 0 }}>Items</div>
          <button type="button" aria-label="Add photos" disabled={!data || uploading === "batch"}
            onClick={() => addInputRef.current?.click()}
            style={{
              width: 40, height: 40, borderRadius: "50%", border: 0, background: "#111", color: "#fff",
              fontSize: 28, lineHeight: 1, fontWeight: 400, cursor: uploading === "batch" ? "wait" : "pointer",
              opacity: !data || uploading === "batch" ? 0.5 : 1,
            }}>
            {uploading === "batch" ? "…" : "+"}
          </button>
          <input ref={addInputRef} type="file" accept="image/*" multiple hidden
            onChange={(e) => {
              const list = e.target.files ? Array.from(e.target.files) : [];
              e.target.value = "";
              if (list.length) void addFromPhotos(list);
            }} />
        </div>
        {withPh.length > 0 && (
          <div className="grid photos">
            {withPh.map((item) => {
              const busy = deleting === item.id;
              return (
                <button key={item.id} type="button" aria-label={item.name || "Item"}
                  disabled={busy}
                  onClick={() => openDetail(item)}
                  className="cell has-photo"
                  style={{ opacity: busy ? 0.55 : 1 }}>
                  <img className="hero" src={(item.photos || [])[0]} alt="" loading="lazy" decoding="async" />
                  <span className="chip price">{money(item.price)}</span>
                </button>
              );
            })}
          </div>
        )}
        <ul style={S.list}>
          {noPh.map((item) => {
            const busy = deleting === item.id;
            return (
              <li key={item.id} style={{ ...S.item, opacity: busy ? 0.55 : 1 }}>
                <div style={{ display: "flex", gap: 8, width: "100%", alignItems: "flex-start" }}>
                  <div style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 600, lineHeight: 1.3, wordBreak: "break-word" }}>
                    {item.name || "Untitled"}
                  </div>
                  <div style={{ flex: "0 0 auto", fontSize: 14, fontVariantNumeric: "tabular-nums", color: "#333", lineHeight: 1.3, paddingTop: 1, whiteSpace: "nowrap" }}>
                    {money(item.price)}
                  </div>
                  {menuBtn(item, busy)}
                </div>
                {item.note ? <div style={{ width: "100%", fontSize: 12, color: "#555", marginTop: 2 }}>{item.note}</div> : null}
              </li>
            );
          })}
          {!items.length && <li style={{ color: "#777" }}>No items yet</li>}
        </ul>
      </section>
      <section style={S.sec}><div style={S.t}>Claims</div>
        <ul style={S.list}>
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
      {open && (() => {
        const busy = deleting === open.id;
        const pics = open.photos || [];
        return (
          <div className="mask" role="dialog" aria-modal="true" aria-label="Edit item"
            onClick={() => !busy && setOpenId(null)}>
            <div className="sheet" onClick={(e) => e.stopPropagation()} style={{ maxHeight: "90vh", overflowY: "auto" }}>
              {pics.length > 0 && (
                <div className="pics">
                  {pics.map((src) => (
                    <div key={src} style={{ position: "relative", width: "calc(50% - 3px)" }}>
                      <img src={src} alt="" loading="lazy" decoding="async"
                        style={{ width: "100%", aspectRatio: "4/3", objectFit: "cover", borderRadius: 8, display: "block", background: "#eee" }} />
                      <button type="button" disabled={busy}
                        onClick={() => deletePhoto(open, src)}
                        style={{ position: "absolute", right: 6, bottom: 6, padding: "4px 8px", border: 0, borderRadius: 6, background: "rgba(176,0,32,.92)", color: "#fff", fontSize: 12, fontWeight: 600 }}>
                        Delete
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Name</label>
              <input value={editName} onChange={(e) => setEditName(e.target.value)} disabled={busy}
                style={{ width: "100%", padding: 10, marginBottom: 10, border: "1px solid #ccc", borderRadius: 8 }} />
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Price</label>
              <input type="number" min={0} inputMode="numeric" value={editPrice} onChange={(e) => setEditPrice(e.target.value)} disabled={busy}
                style={{ width: "100%", padding: 10, marginBottom: 10, border: "1px solid #ccc", borderRadius: 8 }} />
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Note</label>
              <textarea value={editNote} onChange={(e) => setEditNote(e.target.value)} disabled={busy} rows={3}
                style={{ width: "100%", padding: 10, marginBottom: 12, border: "1px solid #ccc", borderRadius: 8, resize: "vertical", font: "inherit" }} />
              <button type="button" className="cta" disabled={busy} onClick={() => void saveDetail()}
                style={{ background: "#111", color: "#fff", marginBottom: 8 }}>Save</button>
              <label style={{ display: "block", width: "100%", textAlign: "center", padding: 12, border: "1px solid #ddd", borderRadius: 8, marginBottom: 8, cursor: uploading === open.id ? "wait" : "pointer", opacity: uploading === open.id || busy ? 0.6 : 1 }}>
                {uploading === open.id ? "Uploading…" : "Add photo"}
                <input type="file" accept="image/*" hidden disabled={busy || uploading === open.id}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) uploadPhoto(open.id, f);
                  }} />
              </label>
              <button type="button" disabled={busy} onClick={() => deleteItem(open)}
                style={{ width: "100%", padding: 12, border: 0, borderRadius: 8, background: "#b00020", color: "#fff", fontWeight: 600 }}>
                {busy ? "…" : "Delete item"}
              </button>
            </div>
          </div>
        );
      })()}
      <Snack snack={snack} />
    </main>
  );
}

const S: Record<string, React.CSSProperties> = {
  wrap: { padding: 12, maxWidth: 560, margin: "0 auto" }, h: { fontSize: 18, margin: "0 0 8px" },
  err: { color: "#b00020", margin: "0 0 8px" },
  list: { listStyle: "none", margin: 0, padding: 0 },
  item: { display: "flex", flexWrap: "wrap", gap: 6, alignItems: "flex-start", padding: "6px 0", borderBottom: "1px solid #eee", fontSize: 13 },
  sec: { marginBottom: 16 }, t: { fontWeight: 600, marginBottom: 6 },
};
