"use client";
import { useCallback, useState } from "react";

type Item = { id: string; name: string; price: number | null; claimId?: string | null; photos?: string[]; note?: string };
type Claim = { id: string; code: string; day: string; slot?: string; contact?: string; contactMethod?: string; itemIds: string[]; status: string };
type AdminState = { address: string; capacity: Record<string, number>; items: Item[]; claims: Claim[]; days: string[] };

export default function AdminPage() {
  const [password, setPassword] = useState("");
  const [authed, setAuthed] = useState(false);
  const [data, setData] = useState<AdminState | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [note, setNote] = useState("");
  const [uploading, setUploading] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async (pw = password) => {
    const res = await fetch("/api/admin", { headers: { "x-admin-password": pw }, cache: "no-store" });
    if (!res.ok) { setAuthed(false); setErr("Bad password"); return; }
    setAuthed(true); setErr(null); setData(await res.json());
  }, [password]);

  async function act(payload: Record<string, unknown>) {
    setErr(null);
    const res = await fetch("/api/admin", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password, ...payload }),
    });
    const body = await res.json();
    if (!res.ok) { setErr(body.error || "Failed"); return false; }
    await load();
    return true;
  }

  async function uploadPhoto(itemId: string, file: File) {
    setUploading(itemId); setErr(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("itemId", itemId);
      const res = await fetch("/api/admin/upload", {
        method: "POST",
        headers: { "x-admin-password": password },
        body: fd,
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Upload failed");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(null);
    }
  }

  async function deleteItem(item: Item) {
    if (!confirm(`Delete "${item.name || "item"}"?`)) return;
    setMenuFor(null); setDeleting(item.id);
    try { await act({ action: "remove", id: item.id }); }
    finally { setDeleting(null); }
  }

  async function deletePhoto(item: Item, url: string, n: number) {
    if (!confirm(`Remove photo ${n} from "${item.name || "item"}"?`)) return;
    setMenuFor(null); setDeleting(item.id);
    try {
      await act({ action: "edit", id: item.id, photos: (item.photos || []).filter((p) => p !== url) });
    } finally { setDeleting(null); }
  }

  if (!authed) return (
    <main style={S.wrap}>
      <h1 style={S.h}>Admin</h1>
      <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} style={S.full} />
      <button type="button" onClick={() => load()} style={S.enter}>Enter</button>
      {err && <p style={S.err}>{err}</p>}
    </main>
  );

  return (
    <main style={S.wrap} onClick={() => menuFor && setMenuFor(null)}>
      <h1 style={S.h}>Admin</h1>
      {err && <p style={S.err}>{err}</p>}
      <section style={S.sec}><div style={S.t}>Address</div>
        <div style={S.row}>
          <input value={data?.address || ""} onChange={(e) => setData((d) => d && { ...d, address: e.target.value })} style={{ flex: 1, padding: 8 }} />
          <button type="button" onClick={() => act({ action: "address", address: data?.address })}>Save</button>
        </div>
      </section>
      <section style={S.sec}><div style={S.t}>Add item</div>
        <div style={{ ...S.row, flexWrap: "wrap" }}>
          <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} style={{ flex: "1 1 120px", padding: 8 }} />
          <input placeholder="Price (blank=Free)" value={price} onChange={(e) => setPrice(e.target.value)} style={{ width: 120, padding: 8 }} />
          <input placeholder="Note" value={note} onChange={(e) => setNote(e.target.value)} style={{ flex: "1 1 100px", padding: 8 }} />
          <button type="button" onClick={async () => { await act({ action: "add", name, price, note }); setName(""); setPrice(""); setNote(""); }}>Add</button>
        </div>
      </section>
      <section style={S.sec}><div style={S.t}>Items</div>
        <ul style={S.list}>
          {(data?.items || []).map((item) => {
            const photos = item.photos || [];
            const busy = deleting === item.id;
            return (
            <li key={item.id} style={{ ...S.item, flexWrap: "wrap", alignItems: "flex-start", opacity: busy ? 0.55 : 1 }}>
              <div style={{ display: "flex", gap: 6, width: "100%", alignItems: "center" }}>
                <input defaultValue={item.name} disabled={busy} onBlur={(e) => e.target.value !== item.name && act({ action: "edit", id: item.id, name: e.target.value })} style={{ flex: 1, padding: 4, minWidth: 0 }} />
                <input defaultValue={item.price ?? ""} placeholder="Free" disabled={busy} onBlur={(e) => act({ action: "edit", id: item.id, price: e.target.value })} style={{ width: 64, padding: 4 }} />
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
              {busy && <div style={{ width: "100%", fontSize: 12, color: "#555", marginTop: 2 }}>Deleting…</div>}
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
      <section style={S.sec}><div style={S.t}>Capacity</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          {(data?.days || []).map((d) => (
            <label key={d} style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
              <span style={{ width: 56 }}>Nov {Number(d.slice(8))}</span>
              <input type="number" defaultValue={data?.capacity[d] ?? 20} onBlur={(e) => act({ action: "capacity", day: d, limit: Number(e.target.value) })} style={{ width: 64, padding: 4 }} />
            </label>
          ))}
        </div>
      </section>
      <section style={S.sec}><div style={S.t}>Claims</div>
        <ul style={S.list}>
          {(data?.claims || []).map((c) => (
            <li key={c.id} style={{ padding: "8px 0", borderBottom: "1px solid #eee", fontSize: 13 }}>
              <div><b>{c.code}</b> · {c.day.slice(5)}{c.slot ? ` · ${c.slot}` : ""} · {c.status}</div>
              <div style={{ color: "#555" }}>{c.itemIds.map((id) => data?.items.find((i) => i.id === id)?.name || id).join(", ")}{c.contactMethod ? ` · ${c.contactMethod}` : ""}{c.contact ? ` · ${c.contact}` : ""}</div>
              {c.status === "booked" && (
                <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                  <button type="button" onClick={() => act({ action: "cancel", id: c.id })}>Cancel</button>
                  <button type="button" onClick={() => act({ action: "picked_up", id: c.id })}>Picked up</button>
                </div>
              )}
            </li>
          ))}
          {!data?.claims?.length && <li style={{ color: "#777" }}>No claims yet</li>}
        </ul>
      </section>
    </main>
  );
}

const S: Record<string, React.CSSProperties> = {
  wrap: { padding: 12, maxWidth: 560, margin: "0 auto" }, h: { fontSize: 18, margin: "0 0 8px" },
  err: { color: "#b00020", margin: "0 0 8px" }, full: { width: "100%", padding: 10, marginBottom: 8 },
  enter: { width: "100%", padding: 10, background: "#111", color: "#fff", border: 0, borderRadius: 6 },
  row: { display: "flex", gap: 6 }, list: { listStyle: "none", margin: 0, padding: 0 },
  item: { display: "flex", gap: 6, alignItems: "center", padding: "6px 0", borderBottom: "1px solid #eee", fontSize: 13 },
  sec: { marginBottom: 16 }, t: { fontWeight: 600, marginBottom: 6 },
};
