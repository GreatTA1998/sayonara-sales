/** Soft LINE → shop id (client). Known names reclaim reserved shops. */
export const NAME_KEY = "ss-line-name";
export const ID_KEY = "ss-shop-id";
const MAP_KEY = "ss-shop-map";
const PROF_KEY = "ss-profile";
export const AUTH_EVT = "ss-auth";

export const ELTON_ID = "elton";
export const ELTON_LABEL = "エルトン";
export const DEFAULT_WARD = "目黒区";

/** LINE名 variants → reserved shop (not a fresh dig5). */
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

export const getName = () => typeof window === "undefined" ? "" : (localStorage.getItem(NAME_KEY) || "").trim();
export const getId = () => typeof window === "undefined" ? "" : (localStorage.getItem(ID_KEY) || "").trim();
export const adminPath = (id: string) => id === ELTON_ID ? "/admin" : `/s/${id}/admin`;
export const notifyAuth = () => {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(AUTH_EVT));
};

const readMap = (): Record<string, string> => {
  try { return JSON.parse(localStorage.getItem(MAP_KEY) || "{}") as Record<string, string>; }
  catch { return {}; }
};

export type Profile = { bio: string; jimotyUrl: string };
export const getProfile = (): Profile => {
  if (typeof window === "undefined") return { bio: "", jimotyUrl: "" };
  try {
    const p = JSON.parse(localStorage.getItem(PROF_KEY) || "{}") as Partial<Profile>;
    return { bio: String(p.bio || ""), jimotyUrl: String(p.jimotyUrl || "") };
  } catch { return { bio: "", jimotyUrl: "" }; }
};
export const saveProfile = (p: Profile) => {
  if (typeof window === "undefined") return;
  localStorage.setItem(PROF_KEY, JSON.stringify({
    bio: p.bio.trim(), jimotyUrl: p.jimotyUrl.trim(),
  }));
};

/** Guest shop id so admin UI works before LINE名 soft-save. */
export const ensureShopId = () => {
  if (typeof window === "undefined") return "";
  let id = getId();
  if (isShop(id)) return id;
  id = newId();
  localStorage.setItem(ID_KEY, id);
  return id;
};

/** Persist LINE名 → id; known sellers reclaim; else reuse guest dig5. */
export const openShop = (n: string) => {
  if (typeof window === "undefined") return "";
  const v = n.trim();
  if (!v) { localStorage.removeItem(NAME_KEY); notifyAuth(); return getId(); }
  const map = readMap();
  const key = norm(v);
  let id = knownId(v) || map[key] || "";
  const cur = getId();
  if (!isShop(id)) {
    id = dig5(cur) ? cur : newId();
  }
  map[key] = id;
  localStorage.setItem(MAP_KEY, JSON.stringify(map));
  localStorage.setItem(NAME_KEY, v);
  localStorage.setItem(ID_KEY, id);
  notifyAuth();
  return id;
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
