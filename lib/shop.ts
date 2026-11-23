/** Soft Jimoty and/or LINE name → one shop. Hard login = LINE OAuth (ss-line-uid). */
const JIMOTY_KEY = "ss-jimoty-name";
const LINE_KEY = "ss-line-name";
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

const clearNames = () => {
  localStorage.removeItem(JIMOTY_KEY); localStorage.removeItem(LINE_KEY);
};

/** Reclaim id↔names so shops aren’t orphaned across Jimoty/LINE soft keys. */
let ready = false;
const hydrate = () => {
  if (ready || typeof window === "undefined") return;
  ready = true;
  let j = stored(JIMOTY_KEY), l = stored(LINE_KEY), id = stored(ID_KEY);
  const map = readMap();
  if (!j && !l && isShop(id)) {
    j = id === ELTON_ID ? ELTON_LABEL : (Object.entries(map).find(([, v]) => v === id)?.[0] || "");
    if (j) localStorage.setItem(JIMOTY_KEY, j);
  }
  const name = j || l;
  if (name && !isShop(id)) id = knownId(j) || knownId(l) || (j && map[norm(j)]) || (l && map[norm(l)]) || "";
  if (!name || !isShop(id)) return;
  if (j) map[norm(j)] = id;
  if (l) map[norm(l)] = id;
  localStorage.setItem(MAP_KEY, JSON.stringify(map));
  localStorage.setItem(ID_KEY, id);
};

const stored = (k: string) => (localStorage.getItem(k) || "").trim();
/** Display identity: Jimoty first, else soft LINE name. */
export const getName = () =>
  typeof window === "undefined" ? "" : (hydrate(), stored(JIMOTY_KEY) || stored(LINE_KEY));
export const getJimotyName = () =>
  typeof window === "undefined" ? "" : (hydrate(), stored(JIMOTY_KEY));
export const getLineName = () =>
  typeof window === "undefined" ? "" : (hydrate(), stored(LINE_KEY));
export const getId = () =>
  typeof window === "undefined" ? "" : (hydrate(), stored(ID_KEY));
export const adminPath = (id: string) => `/s/${id}/admin`;
export const notifyAuth = () => { if (typeof window !== "undefined") window.dispatchEvent(new Event(AUTH_EVT)); };
/** For useSyncExternalStore — identity known on first client paint (no useEffect flash). */
export const subscribeAuth = (cb: () => void) => {
  window.addEventListener(AUTH_EVT, cb);
  return () => window.removeEventListener(AUTH_EVT, cb);
};

export type Profile = { bio: string; jimotyUrl: string; youtubeUrl: string };
export const getProfile = (): Profile => {
  if (typeof window === "undefined") return { bio: "", jimotyUrl: "", youtubeUrl: "" };
  try {
    const p = JSON.parse(localStorage.getItem(PROF_KEY) || "{}") as Partial<Profile>;
    return {
      bio: String(p.bio || ""), jimotyUrl: String(p.jimotyUrl || ""),
      youtubeUrl: String(p.youtubeUrl || ""),
    };
  } catch { return { bio: "", jimotyUrl: "", youtubeUrl: "" }; }
};
export const saveProfile = (p: Profile) => {
  if (typeof window === "undefined") return;
  localStorage.setItem(PROF_KEY, JSON.stringify({
    bio: p.bio.trim(), jimotyUrl: p.jimotyUrl.trim(), youtubeUrl: p.youtubeUrl.trim(),
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

/** Soft login: Jimoty and/or LINE → one account. Empty both clears soft names.
 *  null = account is LINE-secured; soft bypass denied (use OAuth). */
export const softLogin = (jimoty: string, line: string): string | null => {
  if (typeof window === "undefined") return "";
  const j = jimoty.trim(), l = line.trim();
  if (!j && !l) { clearNames(); notifyAuth(); return getId(); }
  const map = readMap();
  const cur = getId();
  let id = knownId(j) || knownId(l) || (j && map[norm(j)]) || (l && map[norm(l)]) || "";
  if (!isShop(id) && isShop(cur)) id = cur;
  if (isShop(id)) {
    const bound = uidBoundTo(id);
    if (bound && stored(UID_KEY) !== bound) return null;
  }
  if (j) localStorage.setItem(JIMOTY_KEY, j);
  if (l) localStorage.setItem(LINE_KEY, l);
  if (isShop(id)) {
    if (j) map[norm(j)] = id;
    if (l) map[norm(l)] = id;
    localStorage.setItem(MAP_KEY, JSON.stringify(map));
    localStorage.setItem(ID_KEY, id);
  }
  notifyAuth();
  return id;
};

/** Single-name soft bind (checkout / legacy). kind=line writes LINE soft name. */
export const openShop = (n: string, kind: "jimoty" | "line" = "jimoty") =>
  softLogin(kind === "jimoty" ? n : "", kind === "line" ? n : "") ?? "";

/** Hard LINE OAuth uid (empty = soft-only / logged out). */
export const getLineUid = () =>
  typeof window === "undefined" ? "" : (hydrate(), stored(UID_KEY));

/**
 * Bind LINE OAuth userId → shop; soft-upgrade LINE display name (keeps Jimoty if set).
 * Prefer active soft shop (or OAuth shop hint) over a stale uid→shop map so soft→hard links.
 */
export const bindLineUser = (uid: string, displayName: string, shopHint = "") => {
  if (typeof window === "undefined" || !uid.trim()) return "";
  const umap = readUidMap();
  const cur = getId();
  const hint = isShop(shopHint) ? shopHint : "";
  const free = (id: string) => { const b = uidBoundTo(id); return !b || b === uid; };
  let id =
    (isShop(cur) && free(cur) ? cur : "") ||
    (hint && free(hint) ? hint : "") ||
    umap[uid] ||
    "";
  const name = displayName.trim();
  localStorage.setItem(UID_KEY, uid);
  if (!isShop(id)) id = softLogin("", name || "LINE") || ensureShopId();
  else if (name) {
    const map = readMap();
    map[norm(name)] = id;
    localStorage.setItem(MAP_KEY, JSON.stringify(map));
    localStorage.setItem(LINE_KEY, name);
    localStorage.setItem(ID_KEY, id);
  }
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
    rows.push({ id, name, ward: DEFAULT_WARD, href: `/s/${id}`, mine: id === mine });
  }
  if (dig5(mine) && !seen.has(mine)) {
    rows.push({ id: mine, name: mineName || mine, ward: DEFAULT_WARD, href: `/s/${mine}`, mine: true });
  }
  return rows;
};
