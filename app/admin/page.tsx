"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Snack, useSnack } from "./snack";

type Item = { id: string; name: string; price: number | null; claimId?: string | null; photos?: string[]; note?: string };
type Claim = { id: string; code: string; day: string; slot?: string; contact?: string; contactMethod?: string; itemIds: string[]; status: string };
type AdminState = { address: string; items: Item[]; claims: Claim[] };

const byPriceDesc = (a: Item, b: Item) => (b.price ?? -1) - (a.price ?? -1);

export default function AdminPage() {
  const [data, setData] = useState<AdminState | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("0");
  const [uploading, setUploading] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const { snack, show } = useSnack();
  const addrTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const addrSaved = useRef("");

  const load = useCallback(async () => {
    const res = await fetch("/api/admin", { cache: "no-store" });
    if (!res.ok) { setErr("Failed to load"); show("Failed to load", "err"); return; }
    setErr(null);
    const body = await res.json();
    setData(body);
    addrSaved.current = body.address || "";
  }, [show]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => () => { if (addrTimer.current) clearTimeout(addrTimer.current); }, []);

  const items = useMemo(
    () => [...(data?.items || [])].sort(byPriceDesc),
    [data?.items],
  );

  function apply(action: string, payload: Record<string, unknown>, body: Record<string, unknown>) {
    setData((d) => {
      if (!d) return d;
      if (action === "add") return { ...d, items: [...d.items, body as unknown as Item] };
      if (action === "edit") {
        const next = body as unknown as Item;
        return { ...d, items: d.items.map((i) => (i.id === next.id ? { ...i, ...next } : i)) };
      }
      if (action === "remove") return { ...d, items: d.items.filter((i) => i.id !== payload.id) };
      if (action === "address") return { ...d, address: String(body.address ?? d.address) };
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

  function onAddressChange(value: string) {
    setData((d) => d && { ...d, address: value });
    if (addrTimer.current) clearTimeout(addrTimer.current);
    addrTimer.current = setTimeout(async () => {
      const next = value.trim();
      if (next === addrSaved.current) return;
      const ok = await act({ action: "address", address: next }, "Saved");
      if (ok) addrSaved.current = String(ok.address ?? next);
    }, 450);
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
      const photos = Array.isArray(body.photos) ? body.photos.map(String) : [];
      setData((d) => d && {
        ...d,
        items: d.items.map((i) => (i.id === itemId ? { ...i, photos } : i)),
      });
      show("Photo uploaded", "ok");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Upload failed";
      setErr(msg); show(msg, "err");
    } finally {
      setUploading(null);
    }
  }

  async function editNote(item: Item) {
    setMenuFor(null);
    const next = window.prompt("Note", item.note || "");
    if (next == null) return;
    await act({ action: "edit", id: item.id, note: next.trim() }, "Saved");
  }

  async function deleteItem(item: Item) {
    if (!confirm(`Delete "${item.name || "item"}"?`)) return;
    setMenuFor(null); setDeleting(item.id); show("Deleting…", "busy");
    try {
      const ok = await act({ action: "remove", id: item.id });
      show(ok ? "Item deleted" : "Delete failed", ok ? "ok" : "err");
    } finally { setDeleting(null); }
  }

  async function deletePhoto(item: Item, url: string, n: number) {
    if (!confirm(`Remove photo ${n} from "${item.name || "item"}"?`)) return;
    const photos = (item.photos || []).filter((p) => p !== url);
    setMenuFor(null); setDeleting(item.id); show("Deleting…", "busy");
    try {
      const ok = await act({ action: "edit", id: item.id, photos });
      show(ok ? "Photo removed" : "Delete failed", ok ? "ok" : "err");
    } finally { setDeleting(null); }
  }

  return (
    <main style={S.wrap} onClick={() => menuFor && setMenuFor(null)}>
      <h1 style={S.h}>Admin</h1>
      {err && <p style={S.err}>{err}</p>}
      {!data && !err && <p style={{ color: "#555" }}>Loading…</p>}
      <section style={S.sec}><div style={S.t}>Address</div>
        <input value={data?.address || ""} onChange={(e) => onAddressChange(e.target.value)}
          style={{ width: "100%", padding: 8 }} />
      </section>
      <section style={S.sec}><div style={S.t}>Add item</div>
        <div style={S.row}>
          <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} style={{ flex: 1, padding: 8, minWidth: 0 }} />
          <input type="number" min={0} inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} style={{ width: 72, padding: 8 }} />
          <button type="button" onClick={async () => {
            const ok = await act({ action: "add", name, price: price === "" ? 0 : Number(price) }, "Item added");
            if (ok) { setName(""); setPrice("0"); }
          }}>Add</button>
        </div>
      </section>
      <section style={S.sec}><div style={S.t}>Items</div>
        <ul style={S.list}>
          {items.map((item) => {
            const photos = item.photos || [];
            const busy = deleting === item.id;
            return (
            <li key={item.id} style={{ ...S.item, flexWrap: "wrap", alignItems: "flex-start", opacity: busy ? 0.55 : 1 }}>
              <div style={{ display: "flex", gap: 6, width: "100%", alignItems: "center" }}>
                <input key={`n-${item.id}-${item.name}`} defaultValue={item.name} disabled={busy}
                  onBlur={(e) => {
                    const v = e.target.value;
                    if (v !== item.name) act({ action: "edit", id: item.id, name: v }, "Saved");
                  }}
                  style={{ flex: 1, padding: 4, minWidth: 0 }} />
                <input key={`p-${item.id}-${item.price ?? 0}`} type="number" min={0} inputMode="numeric"
                  defaultValue={item.price ?? 0} disabled={busy}
                  onBlur={(e) => {
                    const v = e.target.value === "" ? 0 : Number(e.target.value);
                    if (v !== (item.price ?? 0)) act({ action: "edit", id: item.id, price: v }, "Saved");
                  }}
                  style={{ width: 64, padding: 4 }} />
                <label style={{ flex: "0 0 auto", fontSize: 12, padding: "4px 6px", border: "1px dashed #bbb", borderRadius: 4, cursor: uploading === item.id || busy ? "wait" : "pointer", opacity: uploading === item.id || busy ? 0.6 : 1, whiteSpace: "nowrap" }}>
                  {uploading === item.id ? "…" : "+Photo"}
                  <input type="file" accept="image/*" hidden disabled={uploading === item.id || busy}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (f) uploadPhoto(item.id, f);
                    }} />
                </label>
                <div style={{ position: "relative", flex: "0 0 auto" }} onClick={(e) => e.stopPropagation()}>
                  <button type="button" disabled={busy} aria-label="Item menu"
                    onClick={() => setMenuFor(menuFor === item.id ? null : item.id)}
                    style={{ padding: "2px 8px", border: "1px solid #ccc", borderRadius: 4, background: "#fff", minWidth: 32 }}>
                    {busy ? "…" : "⋮"}
                  </button>
                  {menuFor === item.id && !busy && (
                    <div style={{ position: "absolute", right: 0, top: "100%", zIndex: 5, marginTop: 2, minWidth: 140, background: "#fff", border: "1px solid #ccc", borderRadius: 6, boxShadow: "0 4px 12px rgba(0,0,0,.12)", overflow: "hidden" }}>
                      <button type="button" onClick={() => editNote(item)}
                        style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 10px", border: 0, background: "#fff", borderBottom: "1px solid #eee" }}>
                        Edit note
                      </button>
                      {photos.map((src, i) => (
                        <button key={src} type="button" onClick={() => deletePhoto(item, src, i + 1)}
                          style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 10px", border: 0, background: "#fff", borderBottom: "1px solid #eee" }}>
                          Remove photo {i + 1}
                        </button>
                      ))}
                      <button type="button" onClick={() => deleteItem(item)}
                        style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 10px", border: 0, background: "#fff", color: "#b00020" }}>
                        Delete item
                      </button>
                    </div>
                  )}
                </div>
              </div>
              {item.note ? <div style={{ width: "100%", fontSize: 12, color: "#555", marginTop: 2 }}>{item.note}</div> : null}
              {photos.length > 0 && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", width: "100%", alignItems: "center", marginTop: 4 }}>
                  {photos.map((src) => (
                    <img key={src} src={src} alt="" style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 4, display: "block", background: "#eee" }} />
                  ))}
                </div>
              )}
            </li>
            );
          })}
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
      <Snack snack={snack} />
    </main>
  );
}

const S: Record<string, React.CSSProperties> = {
  wrap: { padding: 12, maxWidth: 560, margin: "0 auto" }, h: { fontSize: 18, margin: "0 0 8px" },
  err: { color: "#b00020", margin: "0 0 8px" },
  row: { display: "flex", gap: 6 }, list: { listStyle: "none", margin: 0, padding: 0 },
  item: { display: "flex", gap: 6, alignItems: "center", padding: "6px 0", borderBottom: "1px solid #eee", fontSize: 13 },
  sec: { marginBottom: 16 }, t: { fontWeight: 600, marginBottom: 6 },
};
