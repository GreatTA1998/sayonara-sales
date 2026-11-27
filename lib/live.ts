"use client";
/**
 * Firestore onSnapshot = sole SOT (actions.life / blackboards.io).
 * Writes hit Firestore; UI follows snap (SDK local cache is already optimistic).
 */
import {
  arrayRemove, arrayUnion, collection, doc, getDoc, getDocs, limit, onSnapshot, query, runTransaction, setDoc, updateDoc, deleteDoc,
  where, writeBatch, type Unsubscribe,
} from "firebase/firestore";
import { ensureAuth, getDb, syncBuyerAuthLabel } from "./fb";
import { dayLbl, tokyoYmd } from "./days";
import { DEF_LEAD, DEF_OFF } from "./sale";
import {
  getFacebookName, getJimotyName, getLineName, getLineUid, getName, listBuys,
  type BuyRow,
} from "./shop";
import {
  applyDates, applyItemOff, bookableDays, cartAfter, cartDiscount, claimFields, pickupDays, priceOf,
  ELTON_SHOP, hasBuyerContact, itemFields, normalizeSlots, normalizeSpots, parseShop, shortCode,
  shopFields, shopItemOff, shopSlots, slotTime, storeFromDocs, takenSlots, uid, type Claim, type Item, type Store,
} from "./store";

const asClaim = (id: string, data: Record<string, unknown>): Claim =>
  storeFromDocs({}, [], [{ id, data }]).claims[0];

type ShopSnap = {
  meta: Record<string, unknown> | null;
  items: Map<string, Record<string, unknown>>;
  claims: Map<string, Record<string, unknown>>;
};

function assemble(s: ShopSnap): Store {
  const meta = s.meta || { address: "" };
  return storeFromDocs(
    meta,
    [...s.items.entries()].map(([id, data]) => ({ id, data })),
    [...s.claims.entries()].map(([id, data]) => ({ id, data })),
  );
}

const emptySeed = (id: string): Store =>
  id === ELTON_SHOP
    ? { address: "目黒区", lineInviteUrl: "", phone: "", items: [], claims: [], published: true, leadDays: DEF_LEAD, itemOff: DEF_OFF }
    : { address: "", items: [], claims: [], leadDays: DEF_LEAD, itemOff: DEF_OFF };

const denied = (e: unknown) => String((e as { code?: string })?.code || "").endsWith("permission-denied");
const NO_EDIT = "このショップの編集権限がありません";
const NEED_LOGIN = "ログインしてください";

const softLogged = () => !!(getName() || getLineUid());

/** Soft/LINE labels + ownerUid — only written on claim. */
function claimPatch(uid: string) {
  const j = getJimotyName(), l = getLineName(), f = getFacebookName(), lu = getLineUid();
  return {
    ownerUid: uid, updatedAt: new Date().toISOString(),
    ...(j ? { ownerJimotyName: j } : {}), ...(l ? { ownerLineName: l } : {}),
    ...(f ? { ownerFacebookName: f } : {}), ...(lu ? { ownerLineUid: lu } : {}),
  };
}

/** Seed shop doc with no ownerUid. Claim is a separate write. */
async function ensureShopDoc(shop: string) {
  if (shop === ELTON_SHOP) return;
  await ensureAuth();
  const ref = doc(getDb(), "shops", shop);
  const seed = { ...shopFields(emptySeed(shop)), updatedAt: new Date().toISOString() };
  let snap;
  try { snap = await getDoc(ref); }
  catch (e) {
    if (!denied(e)) throw e;
    await setDoc(ref, seed);
    return;
  }
  if (!snap.exists()) await setDoc(ref, seed);
  else if (!("address" in (snap.data() || {}))) await setDoc(ref, seed, { merge: true });
}

/** Shop already bound to this Firebase uid or LINE uid (empty = none). */
export async function findOwnedShop(): Promise<string> {
  const user = await ensureAuth();
  const db = getDb();
  const uref = doc(db, "uids", user.uid);
  const lu = getLineUid();
  // LINE-secured: durable ownerLineUid wins over stale uids/{anon} dig5.
  if (lu) {
    const byLine = await getDocs(query(collection(db, "shops"), where("ownerLineUid", "==", lu), limit(1)));
    if (!byLine.empty) {
      const id = byLine.docs[0].id;
      try { await setDoc(uref, { shopId: id }); } catch { /* race / offline */ }
      return id;
    }
  }
  const usnap = await getDoc(uref);
  if (usnap.exists()) return String(usnap.data()?.shopId || "");
  const byUid = await getDocs(query(collection(db, "shops"), where("ownerUid", "==", user.uid), limit(1)));
  if (!byUid.empty) {
    const id = byUid.docs[0].id;
    // Lazy-migrate pre-uids claims so rules can block a second shop.
    try { await setDoc(uref, { shopId: id }); } catch { /* race / offline */ }
    return id;
  }
  return "";
}

/**
 * Bind ownership. Soft/LINE required.
 * ok = first claim; mine = already this shop; taken = other owner; other = this account already owns a different shop.
 */
export async function claimShop(shopRaw: string): Promise<"ok" | "mine" | "taken" | "other"> {
  const shop = parseShop(shopRaw);
  if (shop === ELTON_SHOP) return "mine";
  if (!softLogged()) throw new Error(NEED_LOGIN);
  const user = await ensureAuth();
  const owned = await findOwnedShop();
  if (owned && owned !== shop) return "other";
  await ensureShopDoc(shop);
  const db = getDb();
  const ref = doc(db, "shops", shop);
  const uref = doc(db, "uids", user.uid);
  let result: "ok" | "mine" | "taken" | "other" = "ok";
  try {
    await runTransaction(db, async (tx) => {
      const [ssnap, usnap] = await Promise.all([tx.get(ref), tx.get(uref)]);
      const prev = String(ssnap.data()?.ownerUid || "");
      if (prev && prev !== user.uid) { result = "taken"; return; }
      const bound = usnap.exists() ? String(usnap.data()?.shopId || "") : "";
      if (bound && bound !== shop) { result = "other"; return; }
      if (!usnap.exists()) tx.set(uref, { shopId: shop });
      tx.update(ref, claimPatch(user.uid));
      result = prev === user.uid ? "mine" : "ok";
    });
  } catch (e) {
    // uids rules not deployed yet → shop-only claim (client findOwnedShop still gates).
    if (!denied(e)) throw e;
    const prev = String((await getDoc(ref)).data()?.ownerUid || "");
    if (prev && prev !== user.uid) return "taken";
    await updateDoc(ref, claimPatch(user.uid));
    return prev === user.uid ? "mine" : "ok";
  }
  return result;
}

/** Live shop: public onSnapshot (no auth). Admin may seed doc; never auto-claim. */
export function listenShop(
  shopRaw: string,
  onData: (s: Store) => void,
  onErr?: (e: Error) => void,
  opts?: { seed?: boolean },
): Unsubscribe {
  const shop = parseShop(shopRaw);
  const db = getDb();
  const state: ShopSnap = { meta: null, items: new Map(), claims: new Map() };
  // Gate first paint on items+claims so 引取済 filter (default off) never flashes sold.
  let itemsReady = false;
  let claimsReady = false;
  let dead = false;
  const emit = () => { if (itemsReady && claimsReady && !dead) onData(assemble(state)); };
  const fail = (e: unknown) => {
    if (dead) return;
    onErr?.(e instanceof Error ? e : new Error(String(e)));
  };

  let stopClaims: Unsubscribe | null = null;
  let stopShop: Unsubscribe | null = null;
  let stopItems: Unsubscribe | null = null;
  const watchClaims = () => {
    if (stopClaims || dead) return;
    stopClaims = onSnapshot(collection(db, "shops", shop, "claims"), (snap) => {
      state.claims = new Map(snap.docs.map((d) => [d.id, d.data() as Record<string, unknown>]));
      claimsReady = true;
      emit();
    }, (e) => {
      if (denied(e)) { claimsReady = true; emit(); return; }
      fail(e);
    });
  };

  const start = () => {
    if (dead) return;
    stopShop = onSnapshot(doc(db, "shops", shop), (snap) => {
      state.meta = snap.exists() ? (snap.data() as Record<string, unknown>) : { address: "" };
      emit();
    }, fail);
    stopItems = onSnapshot(collection(db, "shops", shop, "items"), (snap) => {
      state.items = new Map(snap.docs.map((d) => [d.id, d.data() as Record<string, unknown>]));
      itemsReady = true;
      watchClaims();
      emit();
    }, fail);
  };

  // New shops 404 until the doc exists — seed without ownerUid; claim is an explicit CTA.
  if (opts?.seed && shop !== ELTON_SHOP) {
    void ensureAuth()
      .then(() => ensureShopDoc(shop))
      .then(start)
      .catch(fail);
  } else start();

  return () => { dead = true; stopShop?.(); stopItems?.(); stopClaims?.(); };
}

/** AppNav: unconfirmed 依頼 count (requested only — not 引き取り予定). */
export function listenPendingRequests(shopRaw: string, onN: (n: number) => void): Unsubscribe {
  const shop = parseShop(shopRaw);
  let stop: Unsubscribe | null = null;
  let dead = false;
  void ensureAuth().then(() => {
    if (dead) return;
    stop = onSnapshot(collection(getDb(), "shops", shop, "claims"), (snap) => {
      onN(snap.docs.reduce((n, d) => n + (d.data().status === "requested" ? 1 : 0), 0));
    }, () => { if (!dead) onN(0); });
  }).catch(() => { if (!dead) onN(0); });
  return () => { dead = true; stop?.(); };
}

/** Public home tabs — Firestore `published==true` (shop docs only; no item counts). */
export async function listPublishedShops(): Promise<{ id: string; ward: string }[]> {
  const snap = await getDocs(query(collection(getDb(), "shops"), where("published", "==", true)));
  const rows = snap.docs.map((d) => ({
    id: d.id,
    ward: String(d.data()?.address || "").trim(),
    at: String(d.data()?.updatedAt || ""),
  }));
  rows.sort((a, b) =>
    (a.id === ELTON_SHOP ? 0 : 1) - (b.id === ELTON_SHOP ? 0 : 1)
    || (b.at || "").localeCompare(a.at || "")
    || a.id.localeCompare(b.id));
  return rows.map(({ id, ward }) => ({ id, ward }));
}

export type UnclaimedShop = {
  id: string; address: string; published: boolean; updatedAt: string;
  facebookUrl?: string; jimotyUrl?: string; otherUrl?: string;
};

/** Elton /admin — dig5 shops with no ownerUid (claimable handoffs / Muse imports). */
export async function listUnclaimedShops(): Promise<UnclaimedShop[]> {
  const snap = await getDocs(collection(getDb(), "shops"));
  return snap.docs
    .filter((d) => /^\d{5}$/.test(d.id) && !d.data()?.ownerUid)
    .map((d) => {
      const x = d.data() || {};
      const fb = String(x.facebookUrl || "").trim();
      const jm = String(x.jimotyUrl || "").trim();
      const ot = String(x.otherUrl || "").trim();
      return {
        id: d.id,
        address: String(x.address || "").trim(),
        published: !!x.published,
        updatedAt: String(x.updatedAt || ""),
        ...(fb ? { facebookUrl: fb } : {}),
        ...(jm ? { jimotyUrl: jm } : {}),
        ...(ot ? { otherUrl: ot } : {}),
      };
    })
    .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || "") || a.id.localeCompare(b.id));
}

/** Wipe unclaimed dig5 (items + claims + shop). UI must gate with exact "OK". */
export async function deleteUnclaimedShop(shopRaw: string): Promise<void> {
  const shop = parseShop(shopRaw);
  if (shop === ELTON_SHOP || !/^\d{5}$/.test(shop)) throw new Error("削除できません");
  await ensureAuth();
  const db = getDb();
  const shopRef = doc(db, "shops", shop);
  const meta = await getDoc(shopRef);
  if (!meta.exists()) return;
  if (meta.data()?.ownerUid) throw new Error("クレーム済みです");
  const [items, claims] = await Promise.all([
    getDocs(collection(db, "shops", shop, "items")),
    getDocs(collection(db, "shops", shop, "claims")),
  ]);
  for (const docs of [claims.docs, items.docs]) {
    for (let i = 0; i < docs.length; i += 400) {
      const b = writeBatch(db);
      docs.slice(i, i + 400).forEach((d) => b.delete(d.ref));
      await b.commit();
    }
  }
  await deleteDoc(shopRef);
}

/**
 * Keep ⊂ claim.itemIds (≥1). Drops clear item.claimId when bound here.
 * `keepRaw` null = keep current list. `from` gates status transitions.
 */
async function setClaimItems(
  shop: string, id: string, keepRaw: string[] | null,
  opts?: { status?: string; from?: string | string[] },
) {
  const db = getDb();
  const cref = doc(db, "shops", shop, "claims", id);
  const csnap = await getDoc(cref);
  const st = csnap.exists() ? String(csnap.data().status) : "";
  const from = opts?.from;
  const fromOk = !from || (Array.isArray(from) ? from.includes(st) : st === from);
  if (!csnap.exists() || !fromOk) throw new Error("No claim");
  const cur: string[] = Array.isArray(csnap.data().itemIds) ? csnap.data().itemIds.map(String) : [];
  const keep = keepRaw == null ? cur : [...new Set(keepRaw.map(String).filter((x: string) => cur.includes(x)))];
  if (!keep.length) throw new Error("品目がありません");
  const drop = cur.filter((x) => !keep.includes(x));
  const patch: Record<string, unknown> = {
    ...(drop.length ? { itemIds: keep } : {}),
    ...(opts?.status ? { status: opts.status } : {}),
  };
  if (!Object.keys(patch).length) return asClaim(id, csnap.data());
  const dropSnaps = await Promise.all(drop.map((iid: string) => getDoc(doc(db, "shops", shop, "items", iid))));
  const batch = writeBatch(db);
  batch.update(cref, patch);
  if (opts?.status === "booked") for (const iid of keep) batch.update(doc(db, "shops", shop, "items", iid), { claimId: id });
  dropSnaps.forEach((s, i) => {
    if (s.exists() && s.data().claimId === id) batch.update(doc(db, "shops", shop, "items", drop[i]), { claimId: null });
  });
  await batch.commit();
  return asClaim(id, { ...csnap.data(), ...patch });
}

/** Admin mutations — same action surface as old /api/admin. */
export async function adminAct(shopRaw: string, body: Record<string, unknown>): Promise<unknown> {
  const shop = parseShop(shopRaw);
  const user = await ensureAuth();
  const db = getDb();
  const shopRef = doc(db, "shops", shop);
  const action = String(body.action || "");
  // Elton: any signed-in user. Unclaimed: any anon/signed-in user may edit+publish.
  // Claimed: only that ownerUid. Editing never writes ownerUid.
  if (shop !== ELTON_SHOP) {
    const meta = (await getDoc(shopRef)).data() || {};
    const prev = String(meta.ownerUid || "");
    if (prev) {
      if (!softLogged()) throw new Error(NEED_LOGIN);
      if (prev !== user.uid) throw new Error(NO_EDIT);
    }
  }

  switch (action) {
    case "add": {
      // Stable client id → retry/replay cannot spawn a second listing.
      const raw = typeof body.id === "string" ? body.id.trim() : "";
      const id = /^i[a-z0-9]+$/i.test(raw) ? raw : uid("i");
      const photos = Array.isArray(body.photos) ? body.photos.map(String).filter(Boolean) : [];
      const item: Item = { id, name: String(body.name || "").trim(), price: priceOf(body.price) };
      if (photos.length) item.photos = photos;
      const ref = doc(db, "shops", shop, "items", id);
      if ((await getDoc(ref)).exists()) {
        if (photos.length) await updateDoc(ref, { photos: arrayUnion(...photos) });
        return item;
      }
      await setDoc(ref, itemFields(item, (await getDocs(collection(db, "shops", shop, "items"))).size));
      return item;
    }
    case "import": {
      // Deterministic scrape dump only — hard ≤50 items, 2×/Tokyo-day per shop.
      const rows = Array.isArray(body.items) ? body.items.slice(0, 50) : [];
      if (!rows.length) throw new Error("取り込む出品がありません");
      const meta = (await getDoc(shopRef)).data() || {};
      const day = tokyoYmd();
      const used = String(meta.jimotyImportDay || "") === day ? Number(meta.jimotyImportCount || 0) : 0;
      if (used >= 2) throw new Error("ジモティ取込は1日2回までです");
      const base = (await getDocs(collection(db, "shops", shop, "items"))).size;
      const batch = writeBatch(db);
      const spotFromItems: { name: string; mapsUrl: string }[] = [];
      const spotSeen = new Set<string>();
      rows.forEach((row, i) => {
        const r = row as Record<string, unknown>;
        const id = uid("i");
        const photos = typeof r.photo === "string" && r.photo ? [String(r.photo)]
          : Array.isArray(r.photos) ? r.photos.map(String).filter(Boolean) : [];
        const note = typeof r.note === "string" ? r.note.trim() : "";
        const spotName = typeof r.spotName === "string" ? r.spotName.trim() : "";
        if (spotName && !spotSeen.has(spotName)) {
          spotSeen.add(spotName);
          spotFromItems.push({ name: spotName, mapsUrl: typeof r.spotMapsUrl === "string" ? r.spotMapsUrl.trim() : "" });
        }
        batch.set(doc(db, "shops", shop, "items", id), itemFields({
          id, name: String(r.name || "").trim(), price: priceOf(r.price),
          jimoty: true, ...(photos.length ? { photos } : {}), ...(note ? { note } : {}),
        }, base + i));
      });
      await batch.commit();
      const jurl = typeof body.jimotyUrl === "string" ? body.jimotyUrl.trim() : "";
      // Merge Jimoty meetup names into shop spots (Maps URL optional / blank OK).
      let pickupSpots: ReturnType<typeof normalizeSpots> | undefined;
      if (spotFromItems.length) {
        const byName = new Map((Array.isArray(meta.pickupSpots) ? normalizeSpots(meta.pickupSpots) : [])
          .map((s) => [s.name, s]));
        for (const s of normalizeSpots(spotFromItems)) {
          const prev = byName.get(s.name);
          if (!prev) byName.set(s.name, s);
          else if (!prev.mapsUrl && s.mapsUrl) byName.set(s.name, { ...prev, mapsUrl: s.mapsUrl });
        }
        pickupSpots = [...byName.values()];
      }
      await updateDoc(shopRef, {
        jimotyImportDay: day, jimotyImportCount: used + 1,
        updatedAt: new Date().toISOString(),
        ...(jurl ? { jimotyUrl: jurl } : {}),
        ...(pickupSpots ? { pickupSpots } : {}),
      });
      return { ok: true, count: rows.length, left: 1 - used };
    }
    case "wipeImport": {
      // Tagged Jimoty rows only; if none tagged (pre-fix import), wipe all for recovery.
      const snap = await getDocs(collection(db, "shops", shop, "items"));
      const tagged = snap.docs.filter((d) => !!(d.data() as { jimoty?: boolean }).jimoty);
      const targets = tagged.length ? tagged : snap.docs;
      if (!targets.length) throw new Error("削除する出品がありません");
      for (let i = 0; i < targets.length; i += 400) {
        const b = writeBatch(db);
        targets.slice(i, i + 400).forEach((d) => b.delete(d.ref));
        await b.commit();
      }
      return { ok: true, count: targets.length, tagged: !!tagged.length };
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
      if ("price" in body) patch.price = priceOf(body.price);
      if ("note" in body) patch.note = body.note ? String(body.note) : null;
      if ("paused" in body) patch.paused = !!body.paused;
      if ("availableAfter" in body) {
        const a = String(body.availableAfter || "").trim();
        patch.availableAfter = /^\d{4}-\d{2}-\d{2}$/.test(a) ? a : null;
      }
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
      if ("facebookUrl" in body) patch.facebookUrl = String(body.facebookUrl || "").trim();
      if ("lineInviteUrl" in body) patch.lineInviteUrl = String(body.lineInviteUrl || "").trim();
      if ("phone" in body) patch.phone = String(body.phone || "").trim();
      if ("otherUrl" in body) patch.otherUrl = String(body.otherUrl || "").trim();
      await updateDoc(shopRef, patch);
      return {
        bio: String(patch.bio ?? ""), jimotyUrl: String(patch.jimotyUrl ?? ""),
        youtubeUrl: String(patch.youtubeUrl ?? ""), facebookUrl: String(patch.facebookUrl ?? ""),
        lineInviteUrl: String(patch.lineInviteUrl ?? ""), phone: String(patch.phone ?? ""),
        otherUrl: String(patch.otherUrl ?? ""),
      };
    }
    case "dates": {
      const meta = (await getDoc(shopRef)).data() || {};
      const s = storeFromDocs(meta as Record<string, unknown>, [], []);
      const out = applyDates(s, body);
      await updateDoc(shopRef, { ...out, updatedAt: new Date().toISOString() });
      return out;
    }
    case "itemOff":
    case "mins": {
      const meta = (await getDoc(shopRef)).data() || {};
      const s = storeFromDocs(meta as Record<string, unknown>, [], []);
      const out = applyItemOff(s, body);
      await updateDoc(shopRef, { ...out, updatedAt: new Date().toISOString() });
      return out;
    }
    case "slots": {
      const slots = normalizeSlots(body.slots);
      await updateDoc(shopRef, { slots, updatedAt: new Date().toISOString() });
      return { slots };
    }
    case "spots": {
      const pickupSpots = normalizeSpots(body.pickupSpots);
      await updateDoc(shopRef, { pickupSpots, updatedAt: new Date().toISOString() });
      return { pickupSpots };
    }
    case "publish": {
      const meta = (await getDoc(shopRef)).data() || {};
      const s = storeFromDocs(meta as Record<string, unknown>, [], []);
      if (!hasBuyerContact(shop, s)) {
        throw new Error("Jimoty・Facebook・LINE・電話・その他のいずれかを入力してください");
      }
      await updateDoc(shopRef, { published: true, updatedAt: new Date().toISOString() });
      return { published: true };
    }
    case "deleteShop": {
      // Empty phantoms only — never elton; refuse when any listing remains.
      if (shop === ELTON_SHOP) throw new Error("削除できません");
      const itemSnap = await getDocs(collection(db, "shops", shop, "items"));
      if (itemSnap.size) throw new Error("出品があるショップは削除できません");
      try {
        const claimSnap = await getDocs(collection(db, "shops", shop, "claims"));
        for (let i = 0; i < claimSnap.docs.length; i += 400) {
          const b = writeBatch(db);
          claimSnap.docs.slice(i, i + 400).forEach((d) => b.delete(d.ref));
          await b.commit();
        }
        await deleteDoc(shopRef);
      } catch (e) {
        // Rules lag: still ok so client can forgetShop (home tabs).
        if (!denied(e)) throw e;
      }
      return { ok: true };
    }
    case "confirm":
      return setClaimItems(
        shop, String(body.id), Array.isArray(body.itemIds) ? body.itemIds.map(String) : null,
        { from: "requested", status: "booked" },
      );
    case "picked_up":
      return setClaimItems(
        shop, String(body.id), Array.isArray(body.itemIds) ? body.itemIds.map(String) : null,
        { from: "booked", status: "picked_up" },
      );
    case "items":
      // Checklist: keep checked line-items; drop frees availability (依頼 / 予定 / 引取済).
      if (!Array.isArray(body.itemIds)) throw new Error("品目がありません");
      return setClaimItems(shop, String(body.id), body.itemIds.map(String), {
        from: ["requested", "booked", "picked_up"],
      });
    case "reschedule": {
      // day+slot + agreed checkbox; no buyer lead; pending or confirmed.
      if (!body.agreed) throw new Error("チャットで合意が必要です");
      const id = String(body.id), day = String(body.day || ""), slot = slotTime(body.slot);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !slot) throw new Error("日付と時間を選んでください");
      const cref = doc(db, "shops", shop, "claims", id);
      const csnap = await getDoc(cref);
      const st = csnap.exists() ? String(csnap.data().status) : "";
      if (st !== "requested" && st !== "booked") throw new Error("No claim");
      await updateDoc(cref, { day, slot });
      return asClaim(id, { ...csnap.data(), day, slot });
    }
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
      await Promise.all((Array.isArray(c.itemIds) ? c.itemIds.map(String) : []).map(async (iid) => {
        const iref = doc(db, "shops", shop, "items", iid);
        const isnap = await getDoc(iref);
        if (isnap.exists() && isnap.data().claimId === id) await updateDoc(iref, { claimId: null });
      }));
      return asClaim(id, { ...c, ...patch });
    }
    default:
      throw new Error("Unknown action");
  }
}

type Waiter = { account?: string; at?: string; lineUid?: string };
const waitersOf = (data: Record<string, unknown> | undefined) =>
  Array.isArray(data?.waiters) ? data!.waiters as Waiter[] : [];

/** Buyer waitlist — transactional append (FIFO; no stale waiters RMW). */
export async function joinWaitLive(
  shopRaw: string, itemId: string, account: string, aliases: string[] = [], lineUid = "",
) {
  const shop = parseShop(shopRaw);
  const a = account.trim();
  const keys = [...new Set([a, ...aliases.map((x) => x.trim())].filter(Boolean))];
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
    if (st !== "booked") throw new Error("待機できません");
    const prev = waitersOf(csnap.data());
    if (prev.some((w) => keys.includes(String(w.account || "")))) return { ok: true as const };
    const row: Waiter = { account: a, at: new Date().toISOString() };
    if (lineUid) row.lineUid = lineUid;
    tx.update(cref, { waiters: [...prev, row] });
    return { ok: true as const };
  });
}

/** Leave waitlist — drop matching accounts (name and/or soft shop id). */
export async function leaveWaitLive(shopRaw: string, itemId: string, accounts: string[]) {
  const shop = parseShop(shopRaw);
  const keys = [...new Set(accounts.map((a) => a.trim()).filter(Boolean))];
  if (!keys.length) throw new Error("アカウントが必要です");
  await ensureAuth();
  const db = getDb();
  return runTransaction(db, async (tx) => {
    const itemSnap = await tx.get(doc(db, "shops", shop, "items", itemId));
    if (!itemSnap.exists()) throw new Error("品目が見つかりません");
    const claimId = itemSnap.data().claimId ? String(itemSnap.data().claimId) : "";
    if (!claimId) throw new Error("待機していません");
    const cref = doc(db, "shops", shop, "claims", claimId);
    const csnap = await tx.get(cref);
    if (!csnap.exists() || String(csnap.data()!.status || "") !== "booked") {
      throw new Error("待機していません");
    }
    const prev = waitersOf(csnap.data());
    const next = prev.filter((w) => !keys.includes(String(w.account || "")));
    if (next.length === prev.length) return { ok: true as const };
    tx.update(cref, { waiters: next });
    return { ok: true as const };
  });
}

/** Soft-name / LINE uid → buys (published+elton claims match contact, else local ss-buys). */
export async function fetchBuyHistory(): Promise<BuyRow[]> {
  const names = new Set(
    [getJimotyName(), getLineName(), getFacebookName(), getName()].map((s) => s.trim()).filter(Boolean),
  );
  const lineUid = getLineUid();
  const local = listBuys();
  if (!names.size && !lineUid) return local;
  const db = getDb();
  const shops = new Set<string>([ELTON_SHOP, ...local.map((b) => b.shop)]);
  try {
    for (const d of (await getDocs(query(collection(db, "shops"), where("published", "==", true)))).docs) {
      shops.add(d.id);
    }
  } catch { /* offline */ }
  const byKey = new Map<string, BuyRow>(local.map((b) => [`${b.shop}|${b.code}|${b.day}|${b.slot}`, b]));
  for (const shop of shops) {
    let snap;
    try { snap = await getDocs(collection(db, "shops", shop, "claims")); }
    catch { continue; }
    const mine = snap.docs.filter((d) => {
      const r = d.data();
      if (String(r.status || "") === "cancelled") return false;
      const c = String(r.contact || "").trim();
      return (c && names.has(c)) || (!!lineUid && String(r.lineUid || "") === lineUid);
    });
    if (!mine.length) continue;
    let label: Record<string, string> = {};
    try {
      label = Object.fromEntries(
        (await getDocs(collection(db, "shops", shop, "items"))).docs
          .map((d) => [d.id, String(d.data().name || "").trim() || "無題"]),
      );
    } catch { /* keep local names */ }
    for (const d of mine) {
      const r = d.data();
      const ids = Array.isArray(r.itemIds) ? r.itemIds.map(String) : [];
      const items = ids.map((id) => label[id]).filter(Boolean);
      const st = String(r.status || "") as BuyRow["status"];
      const key = `${shop}|${r.code || d.id}|${r.day || ""}|${r.slot || ""}`;
      const prev = byKey.get(key);
      byKey.set(key, {
        id: d.id, code: String(r.code || d.id), shop, day: String(r.day || ""), slot: String(r.slot || ""),
        items: items.length ? items : (prev?.items || []),
        at: String(r.createdAt || d.id), status: st,
      });
    }
  }
  return [...byKey.values()].sort((a, b) => (b.at || "").localeCompare(a.at || "")).slice(0, 40);
}

const openClaim = (st: string) => st === "requested" || st === "booked";
const softNames = () => new Set(
  [getJimotyName(), getLineName(), getFacebookName(), getName()].map((s) => s.trim()).filter(Boolean),
);

/** Buyer cancel / 日程変更 — buyerUid or soft contact name (みるく etc.). */
export async function buyerClaimAct(shopRaw: string, body: {
  action: "cancel" | "reschedule"; id: string; day?: string; slot?: string;
}) {
  const shop = parseShop(shopRaw);
  const user = await ensureAuth();
  const db = getDb();
  const id = String(body.id);
  const cref = doc(db, "shops", shop, "claims", id);
  const csnap = await getDoc(cref);
  if (!csnap.exists()) throw new Error("予約が見つかりません");
  const c = csnap.data();
  const contact = String(c.contact || "").trim();
  const uidOk = String(c.buyerUid || "") === user.uid;
  const softOk = !!contact && softNames().has(contact);
  if (!uidOk && !softOk) throw new Error("この予約を変更できません");
  if (!openClaim(String(c.status || ""))) throw new Error("変更できない予約です");
  // Soft path: stamp Auth displayName so rules match contact via token.name.
  if (softOk) await syncBuyerAuthLabel(contact);
  if (body.action === "reschedule") {
    const day = String(body.day || ""), slot = slotTime(body.slot);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !slot) throw new Error("日付と時間を選んでください");
    await updateDoc(cref, { day, slot });
    return asClaim(id, { ...c, day, slot });
  }
  const patch = { status: "cancelled" as const, waiters: [] as [] };
  await updateDoc(cref, patch);
  await Promise.all((Array.isArray(c.itemIds) ? c.itemIds.map(String) : []).map(async (iid) => {
    const iref = doc(db, "shops", shop, "items", iid);
    const isnap = await getDoc(iref);
    if (isnap.exists() && isnap.data().claimId === id) await updateDoc(iref, { claimId: null });
  }));
  return asClaim(id, { ...c, ...patch });
}

/** Days/slots for buyer 日程変更 (excludes this claim from taken). */
export async function loadBuyerPickup(shopRaw: string, claimId: string) {
  const shop = parseShop(shopRaw);
  await ensureAuth();
  const db = getDb();
  const [meta, claims] = await Promise.all([
    getDoc(doc(db, "shops", shop)),
    getDocs(collection(db, "shops", shop, "claims")),
  ]);
  const s = storeFromDocs(
    (meta.data() || {}) as Record<string, unknown>,
    [],
    claims.docs.map((d) => ({ id: d.id, data: d.data() as Record<string, unknown> })),
  );
  const days = pickupDays(s);
  const slots = shopSlots(s);
  const rest = { ...s, claims: s.claims.filter((c) => c.id !== claimId) };
  return { days, slots, taken: (day: string) => takenSlots(rest, day) };
}

/** Buyer book — creates requested claim; snapshot reconciles. アプリ内 also opens a thread. */
export async function bookShop(shopRaw: string, body: {
  day: string; slot: string; itemIds: string[]; contact: string;
  contactMethod: "jimoty" | "line" | "phone" | "facebook" | "other" | "app";
  lineUid?: string;
}): Promise<{ code: string; day: string; slot: string; address: string; contact: string; contactMethod: string; total: number; items: string[]; claimId?: string }> {
  const shop = parseShop(shopRaw);
  const user = await ensureAuth();
  const db = getDb();
  const day = body.day, slot = slotTime(body.slot), itemIds = body.itemIds;
  const contact = body.contact, contactMethod = body.contactMethod;
  const lineUid = (body.lineUid || "").trim();
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

  const booked = await runTransaction(db, async (tx) => {
    const itemSnaps = await Promise.all(itemIds.map((id) => tx.get(doc(db, "shops", shop, "items", id))));
    const items: Item[] = itemSnaps.map((s, i) => {
      if (!s.exists()) throw new Error("品目が見つかりません");
      const r = s.data();
      const a = String(r.availableAfter || "").trim();
      return {
        id: itemIds[i], name: String(r.name || ""), price: r.price == null ? null : Number(r.price),
        claimId: r.claimId ? String(r.claimId) : null, paused: !!r.paused,
        ...( /^\d{4}-\d{2}-\d{2}$/.test(a) ? { availableAfter: a } : {}),
      };
    });
    const after = cartAfter(items);
    if (after && day < after) throw new Error(`${dayLbl(after)}以降に受け取れます`);
    const sub = items.reduce((n, it) => n + (it.price ?? 0), 0);
    const total = Math.max(0, sub - cartDiscount(items.length, shopItemOff(pre)));
    // Claims may move under us — re-check status inside the tx.
    const claimCache = new Map<string, string>();
    for (const it of items) {
      if (it.paused) throw new Error(`${it.name}: 一時停止中`);
      const cur = it.claimId || "";
      if (!cur) continue;
      let st = claimCache.get(cur);
      if (st == null) {
        const csnap = await tx.get(doc(db, "shops", shop, "claims", cur));
        st = csnap.exists() ? String(csnap.data()!.status || "") : "";
        claimCache.set(cur, st);
      }
      if (st === "booked" || st === "picked_up") throw new Error(`${it.name}: 予約済みです`);
    }
    const claimId = uid("c");
    const code = shortCode();
    const claim: Claim = {
      id: claimId, code, day, slot, itemIds: [...itemIds],
      contactMethod, contact: contact.trim(),
      status: "requested", createdAt: new Date().toISOString(), buyerUid: user.uid, waiters: [],
      ...(lineUid ? { lineUid } : {}),
    };
    tx.set(doc(db, "shops", shop, "claims", claimId), claimFields(claim));
    // Only bind free items. Pending/orphan keep pointer; confirm() rebinds on 予約済.
    for (let i = 0; i < items.length; i++) {
      if (!items[i].claimId) tx.update(doc(db, "shops", shop, "items", itemIds[i]), { claimId });
    }
    return {
      code, day, slot, address: String(meta.address || ""), contact: claim.contact!, contactMethod,
      total, items: items.map((it) => it.name), claimId,
      ward: String(meta.address || "").trim(),
      sellerUid: String(meta.ownerUid || ""),
    };
  });

  if (contactMethod === "app") {
    try {
      const { openAppThread } = await import("./chat");
      const first = booked.items[0]?.trim() || "出品";
      const ward = booked.ward.replace(/区$/, "") || booked.ward || "ショップ";
      await openAppThread({
        shopId: shop, claimId: booked.claimId, contact: booked.contact,
        label: `${ward}・${first}`.slice(0, 40),
        sellerUid: booked.sellerUid || undefined,
      });
    } catch { /* claim still stands; inbox may lag */ }
  }
  const { ward: _w, sellerUid: _s, ...out } = booked;
  return out;
}
