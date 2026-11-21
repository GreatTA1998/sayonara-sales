"use client";
/**
 * Firestore snapshot listeners = source of truth (actions.life style).
 * Optimistic local writes reconcile when onSnapshot fires.
 */
import {
  arrayRemove, arrayUnion, collection, doc, getDoc, getDocs, onSnapshot, runTransaction, setDoc, updateDoc, deleteDoc,
  type Unsubscribe,
} from "firebase/firestore";
import { ensureAuth, getDb } from "./fb";
import {
  applyDates, applyMins, bookableDays, cartMeets, cartRule, claimFields, ELTON_SHOP, hasBuyerContact,
  itemFields, itemStatus, normalizeSlots, parseShop, shortCode, shopFields, shopSlots,
  storeFromDocs, takenSlots, uid, type Claim, type Item, type Store,
} from "./store";

const asClaim = (id: string, data: Record<string, unknown>): Claim =>
  storeFromDocs({}, [], [{ id, data }]).claims[0];

type ShopSnap = {
  meta: Record<string, unknown> | null;
  items: Map<string, Record<string, unknown>>;
  claims: Map<string, Record<string, unknown>>;
};

function assemble(s: ShopSnap): Store {
  const meta = s.meta || { address: "目黒区" };
  return storeFromDocs(
    meta,
    [...s.items.entries()].map(([id, data]) => ({ id, data })),
    [...s.claims.entries()].map(([id, data]) => ({ id, data })),
  );
}

const emptySeed = (id: string): Store =>
  id === ELTON_SHOP
    ? { address: "目黒区", lineInviteUrl: "", phone: "", items: [], claims: [], published: true }
    : { address: "目黒区", items: [], claims: [] };

/** Claim ownerUid for non-elton shops. Elton: soft Jimoty era — no UID gate (rules). */
async function claimShopOwner(shop: string, uid: string) {
  if (shop === ELTON_SHOP) return;
  const ref = doc(getDb(), "shops", shop);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    const seed = emptySeed(shop);
    seed.ownerUid = uid;
    await setDoc(ref, { ...shopFields(seed), ownerUid: uid, updatedAt: new Date().toISOString() });
    return;
  }
  const cur = snap.data()?.ownerUid;
  if (!cur) {
    await updateDoc(ref, { ownerUid: uid, updatedAt: new Date().toISOString() });
    return;
  }
  if (cur !== uid) throw new Error("このショップの編集権限がありません");
}

/** Live shop: public onSnapshot (no auth). Owner claim only when opts.claimOwner. */
export function listenShop(
  shopRaw: string,
  onData: (s: Store) => void,
  onErr?: (e: Error) => void,
  opts?: { claimOwner?: boolean },
): Unsubscribe {
  const shop = parseShop(shopRaw);
  const db = getDb();
  const state: ShopSnap = { meta: null, items: new Map(), claims: new Map() };
  // Paint on items alone (shop meta fills in; claims soft-lock via item.claimId).
  let itemsReady = false;
  const emit = () => { if (itemsReady) onData(assemble(state)); };
  const fail = (e: unknown) => onErr?.(e instanceof Error ? e : new Error(String(e)));

  if (opts?.claimOwner && shop !== ELTON_SHOP) {
    void ensureAuth().then((u) => claimShopOwner(shop, u.uid)).catch(fail);
  }

  let stopClaims: Unsubscribe | null = null;
  const watchClaims = () => {
    if (stopClaims) return;
    stopClaims = onSnapshot(collection(db, "shops", shop, "claims"), (snap) => {
      state.claims = new Map(snap.docs.map((d) => [d.id, d.data() as Record<string, unknown>]));
      emit();
    }, (e) => {
      if ((e as { code?: string }).code === "permission-denied") { emit(); return; }
      fail(e);
    });
  };

  const u1 = onSnapshot(doc(db, "shops", shop), (snap) => {
    state.meta = snap.exists() ? (snap.data() as Record<string, unknown>) : { address: "目黒区" };
    emit();
  }, fail);
  const u2 = onSnapshot(collection(db, "shops", shop, "items"), (snap) => {
    state.items = new Map(snap.docs.map((d) => [d.id, d.data() as Record<string, unknown>]));
    itemsReady = true;
    emit();
    watchClaims(); // after first items paint — avoid cold 3-way contention
  }, fail);

  return () => { u1(); u2(); stopClaims?.(); };
}

/** Home tabs — public shop+items. */
export async function peekShop(shopRaw: string): Promise<{ address: string; count: number }> {
  const shop = parseShop(shopRaw);
  const db = getDb();
  const [meta, items] = await Promise.all([
    getDoc(doc(db, "shops", shop)),
    getDocs(collection(db, "shops", shop, "items")),
  ]);
  return {
    address: String(meta.data()?.address || ""),
    count: items.docs.filter((d) => !d.data().paused).length,
  };
}

const numPrice = (v: unknown) => {
  if (v === "" || v == null || Number.isNaN(Number(v))) return 0;
  return Math.max(0, Number(v));
};

async function setClaimStatus(shop: string, id: string, from: string, to: string) {
  const cref = doc(getDb(), "shops", shop, "claims", id);
  const csnap = await getDoc(cref);
  if (!csnap.exists() || csnap.data().status !== from) throw new Error("No claim");
  await updateDoc(cref, { status: to });
  return asClaim(csnap.id, { ...csnap.data(), status: to });
}

/** Admin mutations — same action surface as old /api/admin. */
export async function adminAct(shopRaw: string, body: Record<string, unknown>): Promise<unknown> {
  const shop = parseShop(shopRaw);
  const user = await ensureAuth();
  // Non-elton: await ownership. Elton soft-auth: signedIn only (no ownerUid race).
  if (shop !== ELTON_SHOP) await claimShopOwner(shop, user.uid);
  const db = getDb();
  const shopRef = doc(db, "shops", shop);
  const action = String(body.action || "");

  switch (action) {
    case "add": {
      // Stable client id → retry/replay cannot spawn a second listing.
      const raw = typeof body.id === "string" ? body.id.trim() : "";
      const id = /^i[a-z0-9]+$/i.test(raw) ? raw : uid("i");
      const photos = Array.isArray(body.photos) ? body.photos.map(String).filter(Boolean) : [];
      const item: Item = { id, name: String(body.name || "").trim(), price: numPrice(body.price) };
      if (photos.length) item.photos = photos;
      const ref = doc(db, "shops", shop, "items", id);
      if ((await getDoc(ref)).exists()) {
        if (photos.length) await updateDoc(ref, { photos: arrayUnion(...photos) });
        return item;
      }
      await setDoc(ref, itemFields(item, (await getDocs(collection(db, "shops", shop, "items"))).size));
      return item;
    }
    case "edit": {
      const id = String(body.id);
      const ref = doc(db, "shops", shop, "items", id);
      // Atomic photo field ops (append/remove); full `photos` only for reorder.
      if (typeof body.appendPhoto === "string" && body.appendPhoto) {
        await updateDoc(ref, { photos: arrayUnion(body.appendPhoto) });
        return { id, appendPhoto: body.appendPhoto };
      }
      if (typeof body.removePhoto === "string" && body.removePhoto) {
        await updateDoc(ref, { photos: arrayRemove(body.removePhoto) });
        return { id, removePhoto: body.removePhoto };
      }
      const patch: Record<string, unknown> = {};
      if (body.name != null) patch.name = String(body.name).trim();
      if ("price" in body) patch.price = numPrice(body.price);
      if ("note" in body) patch.note = body.note ? String(body.note) : null;
      if ("paused" in body) patch.paused = !!body.paused;
      if ("photos" in body) {
        patch.photos = Array.isArray(body.photos) ? body.photos.map(String).filter(Boolean) : [];
      }
      if (!Object.keys(patch).length) return { id };
      await updateDoc(ref, patch);
      return { id, ...patch };
    }
    case "remove": {
      await deleteDoc(doc(db, "shops", shop, "items", String(body.id)));
      return { ok: true };
    }
    case "address": {
      const address = String(body.address || "").trim();
      await updateDoc(shopRef, { address, updatedAt: new Date().toISOString() });
      return { address };
    }
    case "profile": {
      const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
      if ("bio" in body) patch.bio = String(body.bio || "").trim();
      if ("jimotyUrl" in body) patch.jimotyUrl = String(body.jimotyUrl || "").trim();
      if ("youtubeUrl" in body) patch.youtubeUrl = String(body.youtubeUrl || "").trim();
      if ("lineInviteUrl" in body) patch.lineInviteUrl = String(body.lineInviteUrl || "").trim();
      if ("phone" in body) patch.phone = String(body.phone || "").trim();
      await updateDoc(shopRef, patch);
      return {
        bio: String(patch.bio ?? ""), jimotyUrl: String(patch.jimotyUrl ?? ""),
        youtubeUrl: String(patch.youtubeUrl ?? ""), lineInviteUrl: String(patch.lineInviteUrl ?? ""),
        phone: String(patch.phone ?? ""),
      };
    }
    case "dates": {
      const meta = (await getDoc(shopRef)).data() || {};
      const s = storeFromDocs(meta as Record<string, unknown>, [], []);
      const out = applyDates(s, body);
      await updateDoc(shopRef, { ...out, updatedAt: new Date().toISOString() });
      return out;
    }
    case "mins": {
      const meta = (await getDoc(shopRef)).data() || {};
      const s = storeFromDocs(meta as Record<string, unknown>, [], []);
      const out = applyMins(s, body);
      await updateDoc(shopRef, { ...out, updatedAt: new Date().toISOString() });
      return out;
    }
    case "slots": {
      const slots = normalizeSlots(body.slots);
      await updateDoc(shopRef, { slots, updatedAt: new Date().toISOString() });
      return { slots };
    }
    case "publish": {
      const meta = (await getDoc(shopRef)).data() || {};
      const s = storeFromDocs(meta as Record<string, unknown>, [], []);
      if (!hasBuyerContact(shop, s)) throw new Error("Jimoty・LINE・電話のいずれかを入力してください");
      await updateDoc(shopRef, { published: true, updatedAt: new Date().toISOString() });
      return { published: true };
    }
    case "confirm":
      return setClaimStatus(shop, String(body.id), "requested", "booked");
    case "picked_up":
      return setClaimStatus(shop, String(body.id), "booked", "picked_up");
    case "cancel": {
      const id = String(body.id);
      const cref = doc(db, "shops", shop, "claims", id);
      const csnap = await getDoc(cref);
      const open = (st: string) => st === "booked" || st === "requested";
      if (!csnap.exists() || !open(String(csnap.data().status))) throw new Error("No claim");
      const c = csnap.data();
      const reason = String(body.reason || "").trim();
      const patch: Record<string, unknown> = { status: "cancelled", waiters: [] };
      if (reason) patch.declineReason = reason;
      await updateDoc(cref, patch);
      for (const iid of (Array.isArray(c.itemIds) ? c.itemIds.map(String) : [])) {
        const iref = doc(db, "shops", shop, "items", iid);
        const isnap = await getDoc(iref);
        if (isnap.exists() && isnap.data().claimId === id) await updateDoc(iref, { claimId: null });
      }
      return asClaim(id, { ...c, ...patch });
    }
    default:
      throw new Error("Unknown action");
  }
}

/** Buyer waitlist — transactional append (no stale waiters RMW). */
export async function joinWaitLive(shopRaw: string, itemId: string, account: string) {
  const shop = parseShop(shopRaw);
  const a = account.trim();
  if (!a) throw new Error("アカウントが必要です");
  await ensureAuth();
  const db = getDb();
  return runTransaction(db, async (tx) => {
    const itemSnap = await tx.get(doc(db, "shops", shop, "items", itemId));
    if (!itemSnap.exists()) throw new Error("品目が見つかりません");
    const claimId = itemSnap.data().claimId ? String(itemSnap.data().claimId) : "";
    if (!claimId) throw new Error("待機できません");
    const cref = doc(db, "shops", shop, "claims", claimId);
    const csnap = await tx.get(cref);
    const st = csnap.exists() ? String(csnap.data()!.status || "") : "";
    if (st !== "requested" && st !== "booked") throw new Error("待機できません");
    const prev = Array.isArray(csnap.data()!.waiters) ? csnap.data()!.waiters as { account?: string; at?: string }[] : [];
    if (prev.some((w) => w.account === a)) return { ok: true as const };
    tx.update(cref, { waiters: [...prev, { account: a, at: new Date().toISOString() }] });
    return { ok: true as const };
  });
}

/** Buyer book — creates requested claim; snapshot reconciles. */
export async function bookShop(shopRaw: string, body: {
  day: string; slot: string; itemIds: string[]; contact: string; contactMethod: "jimoty" | "line" | "phone";
}): Promise<{ code: string; day: string; slot: string; address: string; contact: string; contactMethod: string; total: number; items: string[] }> {
  const shop = parseShop(shopRaw);
  const user = await ensureAuth();
  const db = getDb();
  const { day, slot, itemIds, contact, contactMethod } = body;
  if (!day || !slot || !itemIds.length || !contactMethod || !contact.trim()) {
    throw new Error("日付・時間・連絡先・連絡方法・品目を確認してください");
  }

  const [shopSnap, claimSnaps] = await Promise.all([
    getDoc(doc(db, "shops", shop)),
    getDocs(collection(db, "shops", shop, "claims")),
  ]);
  const meta = (shopSnap.data() || {}) as Record<string, unknown>;
  const pre = storeFromDocs(
    meta,
    [],
    claimSnaps.docs.map((d) => ({ id: d.id, data: d.data() as Record<string, unknown> })),
  );
  if (!bookableDays(pre).includes(day)) throw new Error("その日は選べません");
  if (!shopSlots(pre).includes(slot)) throw new Error("その時間帯は選べません");
  if (takenSlots(pre, day).includes(slot)) throw new Error("その時間帯は埋まっています");

  return runTransaction(db, async (tx) => {
    const itemSnaps = await Promise.all(itemIds.map((id) => tx.get(doc(db, "shops", shop, "items", id))));
    const items: Item[] = itemSnaps.map((s, i) => {
      if (!s.exists()) throw new Error("品目が見つかりません");
      const r = s.data();
      return {
        id: itemIds[i], name: String(r.name || ""), price: r.price == null ? null : Number(r.price),
        claimId: r.claimId ? String(r.claimId) : null, paused: !!r.paused,
      };
    });
    for (const it of items) {
      const st = itemStatus(it);
      if (!st.ok) throw new Error(`${it.name}: ${st.reason}`);
    }
    const totalPre = items.reduce((n, it) => n + (it.price ?? 0), 0);
    if (!cartMeets(pre, items.length, totalPre)) {
      throw new Error(cartRule(pre) || "引き取り条件を満たしていません");
    }
    const claimId = uid("c");
    const code = shortCode();
    const claim: Claim = {
      id: claimId, code, day, slot, itemIds: [...itemIds],
      contactMethod, contact: contact.trim(),
      status: "requested", createdAt: new Date().toISOString(), buyerUid: user.uid, waiters: [],
    };
    tx.set(doc(db, "shops", shop, "claims", claimId), claimFields(claim));
    for (let i = 0; i < itemSnaps.length; i++) {
      if (itemSnaps[i].data()!.claimId) throw new Error(`${items[i].name}: 予約済みです`);
      tx.update(doc(db, "shops", shop, "items", itemIds[i]), { claimId });
    }
    const total = items.reduce((n, it) => n + (it.price ?? 0), 0);
    return {
      code, day, slot, address: String(meta.address || ""), contact: claim.contact!, contactMethod,
      total, items: items.map((it) => it.name),
    };
  });
}
