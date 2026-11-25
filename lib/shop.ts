/** Soft Jimoty / LINE / Facebook name → one shop. Hard login = LINE OAuth (ss-line-uid). */
const JIMOTY_KEY = "ss-jimoty-name";
const LINE_KEY = "ss-line-name";
const FB_KEY = "ss-facebook-name";
const NAME_KEYS = [JIMOTY_KEY, LINE_KEY, FB_KEY] as const;
const ID_KEY = "ss-shop-id";
const MAP_KEY = "ss-shop-map";
const UID_KEY = "ss-line-uid";
const UID_MAP = "ss-line-uid-map";
const PROF_KEY = "ss-profile";
export const AUTH_EVT = "ss-auth";

export const ELTON_ID = "elton";
export const ELTON_LABEL = "エルトン";
export const DEFAULT_WARD = "目黒区";

/** Name variants → reserved shop (not a fresh dig5). */
const KNOWN: Record<string, string> = {
  エルトン: ELTON_ID,
  elton: ELTON_ID,
};

const dig5 = (s: string) => /^\d{5}$/.test(s);
const isShop = (s: string) => dig5(s) || s === ELTON_ID;
const newId = () => String(10000 + Math.floor(Math.random() * 90000));
const norm = (s: string) => s.trim().toLowerCase();
const knownId = (n: string) => KNOWN[norm(n)] || KNOWN[n.trim()] || "";

export type SaleRow = {
  id: string; name: string; ward: string; href: string; mine: boolean;
  count?: number;
};

const readMap = (): Record<string, string> => {
  try { return JSON.parse(localStorage.getItem(MAP_KEY) || "{}") as Record<string, string>; }
  catch { return {}; }
};

const clearNames = () => { for (const k of NAME_KEYS) localStorage.removeItem(k); };

/** Reclaim id↔names so shops aren’t orphaned across soft keys. */
let ready = false;
const hydrate = () => {
  if (ready || typeof window === "undefined") return;
  ready = true;
  let j = stored(JIMOTY_KEY), l = stored(LINE_KEY), f = stored(FB_KEY), id = stored(ID_KEY);
  const map = readMap();
  if (!j && !l && !f && isShop(id)) {
    j = id === ELTON_ID ? ELTON_LABEL : (Object.entries(map).find(([, v]) => v === id)?.[0] || "");
    if (j) localStorage.setItem(JIMOTY_KEY, j);
  }
  const name = j || l || f;
  if (name && !isShop(id)) {
    id = knownId(j) || knownId(l) || knownId(f)
      || (j && map[norm(j)]) || (l && map[norm(l)]) || (f && map[norm(f)]) || "";
  }
  if (!name || !isShop(id)) return;
  for (const n of [j, l, f]) if (n) map[norm(n)] = id;
  localStorage.setItem(MAP_KEY, JSON.stringify(map));
  localStorage.setItem(ID_KEY, id);
};

const stored = (k: string) => (localStorage.getItem(k) || "").trim();
/** Display identity: Jimoty → LINE → Facebook. */
export const getName = () =>
  typeof window === "undefined" ? "" : (hydrate(), stored(JIMOTY_KEY) || stored(LINE_KEY) || stored(FB_KEY));
export const getJimotyName = () =>
  typeof window === "undefined" ? "" : (hydrate(), stored(JIMOTY_KEY));
export const getLineName = () =>
  typeof window === "undefined" ? "" : (hydrate(), stored(LINE_KEY));
export const getFacebookName = () =>
  typeof window === "undefined" ? "" : (hydrate(), stored(FB_KEY));
export const getId = () =>
  typeof window === "undefined" ? "" : (hydrate(), stored(ID_KEY));
export const adminPath = (id: string) => `/s/${id}/admin`;
export const notifyAuth = () => { if (typeof window !== "undefined") window.dispatchEvent(new Event(AUTH_EVT)); };
/** For useSyncExternalStore — identity known on first client paint (no useEffect flash). */
export const subscribeAuth = (cb: () => void) => {
  window.addEventListener(AUTH_EVT, cb);
  return () => window.removeEventListener(AUTH_EVT, cb);
};

export type Profile = { bio: string; jimotyUrl: string; youtubeUrl: string; facebookUrl: string };
export const getProfile = (): Profile => {
  if (typeof window === "undefined") return { bio: "", jimotyUrl: "", youtubeUrl: "", facebookUrl: "" };
  try {
    const p = JSON.parse(localStorage.getItem(PROF_KEY) || "{}") as Partial<Profile>;
    return {
      bio: String(p.bio || ""), jimotyUrl: String(p.jimotyUrl || ""),
      youtubeUrl: String(p.youtubeUrl || ""), facebookUrl: String(p.facebookUrl || ""),
    };
  } catch { return { bio: "", jimotyUrl: "", youtubeUrl: "", facebookUrl: "" }; }
};
export const saveProfile = (p: Profile) => {
  if (typeof window === "undefined") return;
  localStorage.setItem(PROF_KEY, JSON.stringify({
    bio: p.bio.trim(), jimotyUrl: p.jimotyUrl.trim(), youtubeUrl: p.youtubeUrl.trim(),
    facebookUrl: p.facebookUrl.trim(),
  }));
};

/** Guest shop id so admin UI works before soft-save. */
export const ensureShopId = () => {
  if (typeof window === "undefined") return "";
  let id = getId();
  if (isShop(id)) return id;
  id = newId();
  localStorage.setItem(ID_KEY, id);
  notifyAuth();
  return id;
};

const readUidMap = (): Record<string, string> => {
  try { return JSON.parse(localStorage.getItem(UID_MAP) || "{}") as Record<string, string>; }
  catch { return {}; }
};

/** LINE uid already bound to this shop (empty = soft-only / unbound). */
const uidBoundTo = (id: string) => {
  const u = Object.entries(readUidMap()).find(([, v]) => v === id)?.[0] || "";
  return u;
};

/** Soft login: Jimoty and/or LINE and/or Facebook → one account. Empty all clears soft names.
 *  null = account is LINE-secured; soft bypass denied (use OAuth). */
export const softLogin = (jimoty: string, line: string, facebook = ""): string | null => {
  if (typeof window === "undefined") return "";
  const j = jimoty.trim(), l = line.trim(), f = facebook.trim();
  if (!j && !l && !f) { clearNames(); notifyAuth(); return getId(); }
  const map = readMap();
  const cur = getId();
  let id = knownId(j) || knownId(l) || knownId(f)
    || (j && map[norm(j)]) || (l && map[norm(l)]) || (f && map[norm(f)]) || "";
  if (!isShop(id) && isShop(cur)) id = cur;
  if (isShop(id)) {
    const bound = uidBoundTo(id);
    if (bound && stored(UID_KEY) !== bound) return null;
  }
  if (j) localStorage.setItem(JIMOTY_KEY, j);
  if (l) localStorage.setItem(LINE_KEY, l);
  if (f) localStorage.setItem(FB_KEY, f);
  if (isShop(id)) {
    for (const n of [j, l, f]) if (n) map[norm(n)] = id;
    localStorage.setItem(MAP_KEY, JSON.stringify(map));
    localStorage.setItem(ID_KEY, id);
  }
  notifyAuth();
  return id;
};

/** Single-name soft bind (checkout / legacy). */
export const openShop = (n: string, kind: "jimoty" | "line" | "facebook" = "jimoty") =>
  softLogin(kind === "jimoty" ? n : "", kind === "line" ? n : "", kind === "facebook" ? n : "") ?? "";

/** Hard LINE OAuth uid (empty = soft-only / logged out). */
export const getLineUid = () =>
  typeof window === "undefined" ? "" : (hydrate(), stored(UID_KEY));

/**
 * Bind LINE OAuth userId → shop; soft-upgrade LINE display name (keeps Jimoty if set).
 * Soft shop / OAuth hint always win (soft-owner reclaim); name mismatch never spawns a 2nd shop.
 */
export const bindLineUser = (uid: string, displayName: string, shopHint = "") => {
  if (typeof window === "undefined" || !uid.trim()) return "";
  const umap = readUidMap();
  const cur = getId();
  const hint = isShop(shopHint) ? shopHint : "";
  const name = displayName.trim();
  let id = (isShop(cur) ? cur : "") || hint || umap[uid] || knownId(name) || "";
  localStorage.setItem(UID_KEY, uid);
  if (!isShop(id)) id = ensureShopId();
  if (name) {
    const map = readMap();
    map[norm(name)] = id;
    localStorage.setItem(MAP_KEY, JSON.stringify(map));
    localStorage.setItem(LINE_KEY, name);
  }
  localStorage.setItem(ID_KEY, id);
  for (const [k, v] of Object.entries(umap)) if (v === id && k !== uid) delete umap[k];
  umap[uid] = id;
  localStorage.setItem(UID_MAP, JSON.stringify(umap));
  notifyAuth();
  return id;
};

/** Soft-upgrade from hard LINE cookie (any load; also after ?line_ok=1). */
export const applyLineSession = async () => {
  if (typeof window === "undefined") return null;
  const res = await fetch("/api/auth/session", { cache: "no-store", credentials: "same-origin" });
  if (!res.ok) return null;
  const body = await res.json() as { ok?: boolean; uid?: string; name?: string; shop?: string };
  if (!body.ok || !body.uid || !body.name) return null;
  bindLineUser(body.uid, body.name, body.shop || "");
  return body;
};

/** Clear soft names + shop pointer + optional LINE session (map/known reclaim on next sign-in). */
export async function logout() {
  if (typeof window === "undefined") return;
  clearNames(); localStorage.removeItem(UID_KEY); localStorage.removeItem(ID_KEY); notifyAuth();
  try { await fetch("/api/auth/session", { method: "DELETE" }); } catch { /* offline */ }
}
export type BuyRow = { code: string; shop: string; day: string; slot: string; items: string[]; at: string };
const BUY_KEY = "ss-buys";
export const listBuys = (): BuyRow[] => {
  if (typeof window === "undefined") return [];
  try { return (JSON.parse(localStorage.getItem(BUY_KEY) || "[]") as BuyRow[]).slice(0, 40); }
  catch { return []; }
};
export const pushBuy = (row: Omit<BuyRow, "at">) => {
  if (typeof window === "undefined") return;
  localStorage.setItem(BUY_KEY, JSON.stringify([{ ...row, at: new Date().toISOString() }, ...listBuys()].slice(0, 40)));
  notifyAuth();
};

/** Point soft/LINE identity at this shop (claim from preview link). */
export const adoptShop = (id: string) => {
  if (typeof window === "undefined" || !isShop(id)) return;
  const map = readMap();
  const j = stored(JIMOTY_KEY), l = stored(LINE_KEY), f = stored(FB_KEY);
  for (const n of [j, l, f]) if (n) map[norm(n)] = id;
  localStorage.setItem(MAP_KEY, JSON.stringify(map));
  localStorage.setItem(ID_KEY, id);
  const uid = stored(UID_KEY);
  if (uid) {
    const umap = readUidMap();
    for (const [k, v] of Object.entries(umap)) if (v === id && k !== uid) delete umap[k];
    umap[uid] = id;
    localStorage.setItem(UID_MAP, JSON.stringify(umap));
  }
  notifyAuth();
};

/** Drop a shop from local map/pointer (home tabs + 投稿一覧). Does not touch Firestore. */
export const forgetShop = (id: string) => {
  if (typeof window === "undefined" || !isShop(id) || id === ELTON_ID) return;
  const map = readMap();
  for (const [k, v] of Object.entries(map)) if (v === id) delete map[k];
  localStorage.setItem(MAP_KEY, JSON.stringify(map));
  const umap = readUidMap();
  for (const [k, v] of Object.entries(umap)) if (v === id) delete umap[k];
  localStorage.setItem(UID_MAP, JSON.stringify(umap));
  if (stored(ID_KEY) === id) localStorage.removeItem(ID_KEY);
  notifyAuth();
};

/** Hub sales: Elton in 目黒区 + local soft-identity shops. */
export const listSales = (): SaleRow[] => {
  if (typeof window === "undefined") {
    return [{ id: ELTON_ID, name: ELTON_LABEL, ward: DEFAULT_WARD, href: "/s/elton", mine: false }];
  }
  const map = readMap();
  const mine = getId();
  const mineName = getName();
  const rows: SaleRow[] = [
    { id: ELTON_ID, name: ELTON_LABEL, ward: DEFAULT_WARD, href: "/s/elton", mine: mine === ELTON_ID },
  ];
  const seen = new Set<string>([ELTON_ID]);
  for (const [name, id] of Object.entries(map)) {
    if (!dig5(id) || seen.has(id)) continue;
    seen.add(id);
    rows.push({ id, name, ward: "", href: `/s/${id}`, mine: id === mine });
  }
  if (dig5(mine) && !seen.has(mine)) {
    rows.push({ id: mine, name: mineName || mine, ward: "", href: `/s/${mine}`, mine: true });
  }
  return rows;
};
