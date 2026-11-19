"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AppNav from "@/components/app-nav";
import { Icon, IconBtn } from "@/components/icons";
import { Listings, type PhotoItem } from "@/components/photo-listing";
import { Snack, useSnack } from "@/components/snack";
import { dayLbl, isLateOnly } from "@/lib/days";
import { AUTH_EVT, adminPath, getName, getProfile, openShop, saveProfile } from "@/lib/shop";

type Item = PhotoItem & { claimId?: string | null; note?: string; availableFrom?: string; availableTo?: string };
type Claim = {
  id: string; code: string; day: string; slot?: string; contact?: string; contactMethod?: string;
  itemIds: string[]; status: string;
};
type AdminState = { address: string; bio?: string; jimotyUrl?: string; items: Item[]; claims: Claim[] };
type Props = { shop: string; name: string };

const IMG_ACCEPT = "image/jpeg,image/png,image/heic,image/heif,image/webp,image/gif,.jpg,.jpeg,.png,.heic,.heif,.webp,.gif";
const api = (shop: string, path: string) => `${path}?shop=${encodeURIComponent(shop)}`;
const byPriceDesc = (a: Item, b: Item) => (b.price ?? -1) - (a.price ?? -1);
const methodJa = (m?: string) => (m === "phone" ? "電話" : m === "line" ? "LINE" : m || "");

export default function ShopAdminView({ shop, name }: Props) {
  const [data, setData] = useState<AdminState | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPrice, setEditPrice] = useState("0");
  const [editNote, setEditNote] = useState("");
  const [editLate, setEditLate] = useState(false);
  const [sheetMenu, setSheetMenu] = useState<string | null>(null);
  const [logged, setLogged] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [lineDraft, setLineDraft] = useState("");
  const [label, setLabel] = useState(/^\d{5}$/.test(name) ? "" : name);
  const fileRef = useRef<HTMLInputElement>(null);
  const [bio, setBio] = useState("");
  const [jimoty, setJimoty] = useState("");
  const [pubOk, setPubOk] = useState(false);
  const { snack, show } = useSnack();
  const [addrDraft, setAddrDraft] = useState("");
  const addrDraftRef = useRef("");
  const addrTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const addrSaved = useRef("");
  const addrDirty = useRef(false);
  const addrReq = useRef(0);

  const load = useCallback(async () => {
    const res = await fetch(api(shop, "/api/admin"), { cache: "no-store" });
    if (!res.ok) { setErr("読み込みに失敗しました"); show("読み込みに失敗しました", "err"); return; }
    setErr(null);
    const body = await res.json() as AdminState;
    setData(body);
    addrSaved.current = body.address || "";
    if (!addrDirty.current) {
      addrDraftRef.current = body.address || "";
      setAddrDraft(body.address || "");
    }
    const local = getProfile();
    setBio(body.bio || local.bio || "");
    setJimoty(body.jimotyUrl || local.jimotyUrl || "");
  }, [shop, show]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const sync = () => {
      const n = getName();
      setLogged(!!n);
      if (n) setLabel(n);
    };
    sync();
    window.addEventListener(AUTH_EVT, sync);
    return () => window.removeEventListener(AUTH_EVT, sync);
  }, []);
  useEffect(() => () => { if (addrTimer.current) clearTimeout(addrTimer.current); }, []);

  const items = useMemo(() => [...(data?.items || [])].sort(byPriceDesc), [data?.items]);
  const open = useMemo(() => items.find((i) => i.id === openId) || null, [items, openId]);
  const pending = useMemo(() => (data?.claims || []).filter((c) => c.status === "booked"), [data?.claims]);
  const done = useMemo(() => (data?.claims || []).filter((c) => c.status === "picked_up"), [data?.claims]);

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
    const res = await fetch(api(shop, "/api/admin"), {
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
    const res = await fetch(api(shop, "/api/admin"), {
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

  async function persistProfile(nextBio: string, nextJimoty: string) {
    saveProfile({ bio: nextBio, jimotyUrl: nextJimoty });
    await act({ action: "profile", bio: nextBio, jimotyUrl: nextJimoty });
  }

  function openDetail(item: Item) {
    setSheetMenu(null);
    setOpenId(item.id);
    setEditName(item.name);
    setEditPrice(String(item.price ?? 0));
    setEditNote(item.note || "");
    setEditLate(isLateOnly(item));
  }

  async function saveDetail() {
    if (!open) return;
    const nextPrice = editPrice === "" ? 0 : Number(editPrice);
    const wasLate = isLateOnly(open);
    const payload: Record<string, unknown> = { action: "edit", id: open.id };
    let changed = false;
    if (editName !== open.name) { payload.name = editName; changed = true; }
    if (nextPrice !== (open.price ?? 0)) { payload.price = nextPrice; changed = true; }
    if (editNote !== (open.note || "")) { payload.note = editNote.trim(); changed = true; }
    if (editLate !== wasLate) { payload.lateOnly = editLate; changed = true; }
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
      const res = await fetch(api(shop, "/api/admin/upload"), { method: "POST", body: fd });
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
    setUploading("batch"); setErr(null);
    let ok = 0;
    show(`アップロード中 0/${images.length}…`, "busy");
    for (let i = 0; i < images.length; i++) {
      try {
        const fd = new FormData();
        fd.set("file", images[i]);
        const res = await fetch(api(shop, "/api/admin/upload"), { method: "POST", body: fd });
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

  function saveLogin(e: { preventDefault(): void }) {
    e.preventDefault();
    const id = openShop(lineDraft);
    if (!id) return;
    setLogged(true);
    setLabel(lineDraft.trim());
    setLoginOpen(false);
    if (id !== shop) {
      window.location.href = adminPath(id);
      return;
    }
    show("保存しました", "ok");
  }

  function publish() {
    const href = shop === "elton" ? "/s/elton" : `/s/${shop}`;
    setPubOk(true);
    show("公開しました", "ok");
    setTimeout(() => setPubOk(false), 1800);
    if (typeof window !== "undefined") {
      const url = `${window.location.origin}${href}`;
      void navigator.clipboard?.writeText(url).catch(() => undefined);
    }
  }

  const busyOpen = open ? deleting === open.id : false;
  const pics = open?.photos || [];
  const empty = !!data && !items.length;

  return (
    <main className="buy admin">
      <header className="bar admin-bar">
        <span className="shop" aria-label="ショップ名">{label || "Admin"}</span>
        <label className="area-float">
          <span>区</span>
          <input value={addrDraft} disabled={!data}
            onChange={(e) => onAddressChange(e.target.value)}
            placeholder="目黒区" autoComplete="address-level2" />
        </label>
        <span className="spacer" aria-hidden="true" />
        {!logged ? (
          <button type="button" className="login-save" onClick={() => { setLineDraft(""); setLoginOpen(true); }}>
            ログインして保存
          </button>
        ) : (
          <button type="button" className="req" onClick={publish}>
            {pubOk ? "リンクコピー済" : "公開する"}
          </button>
        )}
        <IconBtn name="plus" label="品目を追加" size={22}
          disabled={!data || uploading === "batch"}
          onClick={() => fileRef.current?.click()} className="solid" />
        <input ref={fileRef} type="file" accept={IMG_ACCEPT} multiple hidden
          disabled={!data || uploading === "batch"}
          onChange={(e) => { const f = e.target.files; e.target.value = ""; if (f?.length) void addFromPhotos(Array.from(f)); }} />
      </header>

      {err && <div className="err">{err}</div>}
      {!data && !err && <p className="text-sm text-muted pad">読み込み中…</p>}

      {pending.length > 0 && (
        <section className="claims pending">
          <div className="claims-h">引き取り予定</div>
          <ol className="timeline">
            {pending.map((c) => {
              const names = c.itemIds
                .map((id) => data?.items.find((i) => i.id === id)?.name?.trim() || "無題")
                .join("、");
              const contact = [
                methodJa(c.contactMethod),
                c.contact && c.contact !== "LINE" ? c.contact : "",
              ].filter(Boolean).join(" · ");
              return (
                <li key={c.id} className="tl-item">
                  <div className="tl-time">
                    <b>{dayLbl(c.day)}</b>
                    {c.slot ? <span>{c.slot}</span> : null}
                  </div>
                  <div className="tl-body">
                    <div className="text-base">{names}</div>
                    {contact ? <div className="text-sm text-muted">{contact}</div> : null}
                    <div className="claim-acts">
                      <button type="button" onClick={() => act({ action: "cancel", id: c.id }, "保存しました")}>キャンセル</button>
                      <button type="button" onClick={() => act({ action: "picked_up", id: c.id }, "受取済み")}>受取済み</button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      <section className="prof-block">
        <div className="claims-h">ショップ情報</div>
        <label className="float"><span>ショップメモ</span>
          <textarea value={bio} rows={2} onChange={(e) => setBio(e.target.value)}
            onBlur={() => void persistProfile(bio, jimoty)} placeholder="動作確認・値引き・引越し・車・まとめ買い優先など" /></label>
        <label className="float"><span>ジモティーURL（任意）</span>
          <input value={jimoty} onChange={(e) => setJimoty(e.target.value)}
            onBlur={() => void persistProfile(bio, jimoty)}
            placeholder="https://jmty.jp/…" inputMode="url" /></label>
      </section>

      {empty ? (
        <section className="tutorial">
          <p className="text-xl font-bold">はじめての出品</p>
          <p className="text-2xl font-bold">写真を複数枚選ぶと、1枚ごとに品目ができます。<br />名前や詳細はあとからでOK。</p>
          <button type="button" className="cta go" onClick={() => fileRef.current?.click()}
            disabled={uploading === "batch"}>写真を追加</button>
        </section>
      ) : (
        <Listings items={items} onSelect={openDetail}
          disabledFor={(it) => deleting === it.id}
          classNameFor={(it) => (deleting === it.id ? "dim" : "")} />
      )}

      {done.length > 0 && (
        <section className="claims done">
          <div className="claims-h">完了</div>
          <p className="hint thanks">ありがとう。スムーズな受け渡しでした。</p>
          <ul>
            {done.map((c) => (
              <li key={c.id} className="claim">
                <div className="text-sm text-muted">{dayLbl(c.day)}{c.slot ? ` · ${c.slot}` : ""} · 受取済</div>
              </li>
            ))}
          </ul>
          <p className="soft-promo hint">
            ほかの小さなアプリも →{" "}
            <a className="linelink" href="https://linelton.dev" target="_blank" rel="noopener noreferrer">linelton.dev</a>
          </p>
        </section>
      )}

      {loginOpen && (
        <div className="mask" role="dialog" aria-modal="true" aria-label="ログインして保存"
          onClick={() => setLoginOpen(false)}>
          <form className="sheet" onClick={(e) => e.stopPropagation()} onSubmit={saveLogin}>
            <h2>ログインして保存</h2>
            <p className="hint">LINE名だけでOK。ゲスト出品はこの名前に紐づきます。</p>
            <label className="float"><span>LINE名</span>
              <input value={lineDraft} onChange={(e) => setLineDraft(e.target.value)}
                placeholder="表示名" autoComplete="nickname" autoFocus /></label>
            <button type="submit" className="cta go" disabled={!lineDraft.trim()}>保存</button>
            <p className="hint" style={{ marginTop: 10 }}>より安全なLINE連携は準備中</p>
          </form>
        </div>
      )}

      {open && (
        <div className="mask" role="dialog" aria-modal="true" aria-label="品目を編集"
          onClick={() => { if (!busyOpen) { setSheetMenu(null); setOpenId(null); } }}>
          <div className="sheet" onClick={(e) => { e.stopPropagation(); if (sheetMenu) setSheetMenu(null); }}
            style={{ maxHeight: "90vh", overflowY: "auto" }}>
            <div className="add-head">
              <h2>編集</h2>
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
            <label className="late-check">
              <input type="checkbox" checked={editLate} disabled={busyOpen}
                onChange={(e) => setEditLate(e.target.checked)} />
              <span>後半のみ（最後の4日）</span>
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
      <AppNav />
      <Snack snack={snack} />
    </main>
  );
}
