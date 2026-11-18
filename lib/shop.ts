/** Soft LINE → 5-digit id (client). Blob multi-key = TODO in store. */
export const NAME_KEY = "ss-line-name";
export const ID_KEY = "ss-shop-id";
const MAP_KEY = "ss-shop-map";
const GEO_KEY = "ss-shop-geo";

const dig5 = (s: string) => /^\d{5}$/.test(s);
const newId = () => String(10000 + Math.floor(Math.random() * 90000));

/** 目黒区附近 — default map center / pin fallback. */
export const MEGURO = { lat: 35.6415, lng: 139.698 };

export type Pin = { id: string; name: string; lat: number; lng: number; mine: boolean };

export const getName = () => typeof window === "undefined" ? "" : (localStorage.getItem(NAME_KEY) || "").trim();
export const getId = () => typeof window === "undefined" ? "" : (localStorage.getItem(ID_KEY) || "").trim();

const readMap = (): Record<string, string> => {
  try { return JSON.parse(localStorage.getItem(MAP_KEY) || "{}") as Record<string, string>; }
  catch { return {}; }
};
const readGeo = (): Record<string, { lat: number; lng: number }> => {
  try { return JSON.parse(localStorage.getItem(GEO_KEY) || "{}") as Record<string, { lat: number; lng: number }>; }
  catch { return {}; }
};

/** Deterministic offset from id so pins spread without real GPS. */
const jitter = (id: string) => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return {
    lat: MEGURO.lat + ((h % 100) - 50) * 0.00045,
    lng: MEGURO.lng + (((h >> 8) % 100) - 50) * 0.00045,
  };
};

/** Persist LINE名 → random 5-digit id; reuse on same name. Returns id. */
export const openShop = (n: string) => {
  if (typeof window === "undefined") return "";
  const v = n.trim();
  if (!v) { localStorage.removeItem(NAME_KEY); localStorage.removeItem(ID_KEY); return ""; }
  const map = readMap();
  const key = v.toLowerCase();
  let id = map[key] || "";
  if (!dig5(id)) { id = newId(); map[key] = id; localStorage.setItem(MAP_KEY, JSON.stringify(map)); }
  localStorage.setItem(NAME_KEY, v);
  localStorage.setItem(ID_KEY, id);
  return id;
};

export const saveGeo = (id: string, lat: number, lng: number) => {
  if (typeof window === "undefined" || !dig5(id)) return;
  const geo = readGeo();
  geo[id] = { lat, lng };
  localStorage.setItem(GEO_KEY, JSON.stringify(geo));
};

/** Pins for hub map: every known LINE名→id, plus mine if map empty of names. */
export const listPins = (): Pin[] => {
  if (typeof window === "undefined") return [];
  const map = readMap();
  const geo = readGeo();
  const mine = getId();
  const mineName = getName();
  const byId = new Map<string, string>();
  for (const [name, id] of Object.entries(map)) {
    if (dig5(id)) byId.set(id, name);
  }
  if (dig5(mine) && !byId.has(mine)) byId.set(mine, mineName || mine);
  return [...byId.entries()].map(([id, name]) => {
    const g = geo[id] || jitter(id);
    return { id, name: name || id, lat: g.lat, lng: g.lng, mine: id === mine };
  });
};
