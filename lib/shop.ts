/** Soft LINE → 5-digit shop id (client). Blob multi-key = TODO in store. */
export const NAME_KEY = "ss-line-name";
export const ID_KEY = "ss-shop-id";
const MAP_KEY = "ss-shop-map";

const dig5 = (s: string) => /^\d{5}$/.test(s);
const newId = () => String(10000 + Math.floor(Math.random() * 90000));

export const getName = () => typeof window === "undefined" ? "" : (localStorage.getItem(NAME_KEY) || "").trim();
export const getId = () => typeof window === "undefined" ? "" : (localStorage.getItem(ID_KEY) || "").trim();

/** Persist LINE名 → random 5-digit id; reuse on same name. Returns shop id. */
export const openShop = (n: string) => {
  if (typeof window === "undefined") return "";
  const v = n.trim();
  if (!v) { localStorage.removeItem(NAME_KEY); localStorage.removeItem(ID_KEY); return ""; }
  let map: Record<string, string> = {};
  try { map = JSON.parse(localStorage.getItem(MAP_KEY) || "{}") as Record<string, string>; } catch { /* */ }
  const key = v.toLowerCase();
  let id = map[key] || "";
  if (!dig5(id)) { id = newId(); map[key] = id; localStorage.setItem(MAP_KEY, JSON.stringify(map)); }
  localStorage.setItem(NAME_KEY, v);
  localStorage.setItem(ID_KEY, id);
  return id;
};
