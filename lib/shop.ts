/** Soft Jimoty username → shop id. Legacy `ss-line-name` read fallback. */
const NAME_KEY = "ss-jimoty-name";
const LEGACY_NAME_KEY = "ss-line-name";
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

export const getName = () => typeof window === "undefined" ? ""
  : (localStorage.getItem(NAME_KEY) || localStorage.getItem(LEGACY_NAME_KEY) || "").trim();
export const getId = () => typeof window === "undefined" ? "" : (localStorage.getItem(ID_KEY) || "").trim();
export const adminPath = (id: string) => `/s/${id}/admin`;
export const notifyAuth = () => { if (typeof window !== "undefined") window.dispatchEvent(new Event(AUTH_EVT)); };
/** For useSyncExternalStore — identity known on first client paint (no useEffect flash). */
export const subscribeAuth = (cb: () => void) => {
  window.addEventListener(AUTH_EVT, cb);
  return () => window.removeEventListener(AUTH_EVT, cb);
};

const readMap = (): Record<string, string> => {
  try { return JSON.parse(localStorage.getItem(MAP_KEY) || "{}") as Record<string, string>; }
  catch { return {}; }
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

const clearNames = () => {
  localStorage.removeItem(NAME_KEY); localStorage.removeItem(LEGACY_NAME_KEY);
};
const writeName = (v: string) => {
  localStorage.setItem(NAME_KEY, v); localStorage.removeItem(LEGACY_NAME_KEY);
};

/** Soft Jimoty name. Bind shop only when reclaiming known/map or an existing guest dig5 — never invent. */
export const openShop = (n: string) => {
  if (typeof window === "undefined") return "";
  const v = n.trim();
  if (!v) { clearNames(); notifyAuth(); return getId(); }
  const map = readMap();
  const key = norm(v);
  const cur = getId();
  let id = knownId(v) || map[key] || "";
  if (!isShop(id) && dig5(cur)) id = cur;
  writeName(v);
  if (isShop(id)) {
    map[key] = id;
    localStorage.setItem(MAP_KEY, JSON.stringify(map));
    localStorage.setItem(ID_KEY, id);
  }
  notifyAuth();
  return id;
};

/** Bind LINE userId → current/guest shop; soft-upgrade display name. */
export const bindLineUser = (uid: string, displayName: string) => {
  if (typeof window === "undefined" || !uid.trim()) return "";
  const umap = readUidMap();
  const cur = getId();
  let id = umap[uid] || (isShop(cur) ? cur : "");
  const name = displayName.trim();
  if (!isShop(id)) id = openShop(name || "Jimoty") || ensureShopId();
  else if (name) {
    const map = readMap();
    map[norm(name)] = id;
    localStorage.setItem(MAP_KEY, JSON.stringify(map));
    writeName(name);
    localStorage.setItem(ID_KEY, id);
    notifyAuth();
  }
  umap[uid] = id;
  localStorage.setItem(UID_MAP, JSON.stringify(umap));
  localStorage.setItem(UID_KEY, uid);
  return id;
};

/** After OAuth redirect (?line_ok=1): pull session and soft-upgrade. */
export const applyLineSession = async () => {
  if (typeof window === "undefined") return null;
  const res = await fetch("/api/auth/session", { cache: "no-store" });
  if (!res.ok) return null;
  const body = await res.json() as { ok?: boolean; uid?: string; name?: string };
  if (!body.ok || !body.uid || !body.name) return null;
  bindLineUser(body.uid, body.name);
  return body;
};

/** Clear soft name + optional LINE OAuth session (keep guest shop id). */
export async function logout() {
  if (typeof window === "undefined") return;
  clearNames(); localStorage.removeItem(UID_KEY); notifyAuth();
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
