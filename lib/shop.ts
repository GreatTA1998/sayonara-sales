/** Soft LINE → 5-digit id (client). Elton = separate path + blob. */
export const NAME_KEY = "ss-line-name";
export const ID_KEY = "ss-shop-id";
const MAP_KEY = "ss-shop-map";
const GEO_KEY = "ss-shop-geo";

export const ELTON_ID = "elton";
export const ELTON_LABEL = "エルトン";
export const DEFAULT_WARD = "目黒区";

const dig5 = (s: string) => /^\d{5}$/.test(s);
const newId = () => String(10000 + Math.floor(Math.random() * 90000));

/** 目黒区附近 — default map center. */
export const MEGURO = { lat: 35.6415, lng: 139.698 };

/** Known wards for hub map (ward-level only). */
export const WARDS: Record<string, { lat: number; lng: number }> = {
  目黒区: MEGURO,
};

export type Pin = { id: string; name: string; lat: number; lng: number; mine: boolean; ward: string };
export type SaleRow = { id: string; name: string; ward: string; href: string; mine: boolean };

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

/** Guest shop id so admin UI works before LINE名 soft-save. */
export const ensureShopId = () => {
  if (typeof window === "undefined") return "";
  let id = getId();
  if (dig5(id)) return id;
  id = newId();
  localStorage.setItem(ID_KEY, id);
  return id;
};

/** Persist LINE名 → id; reuse guest id when name is new. */
export const openShop = (n: string) => {
  if (typeof window === "undefined") return "";
  const v = n.trim();
  if (!v) { localStorage.removeItem(NAME_KEY); return getId(); }
  const map = readMap();
  const key = v.toLowerCase();
  let id = map[key] || "";
  const cur = getId();
  if (!dig5(id)) {
    id = dig5(cur) ? cur : newId();
    map[key] = id;
    localStorage.setItem(MAP_KEY, JSON.stringify(map));
  }
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

/** Hub sales: Elton in 目黒区 + local soft-identity shops. */
export const listSales = (): SaleRow[] => {
  if (typeof window === "undefined") {
    return [{ id: ELTON_ID, name: ELTON_LABEL, ward: DEFAULT_WARD, href: "/s/elton", mine: false }];
  }
  const map = readMap();
  const mine = getId();
  const mineName = getName();
  const rows: SaleRow[] = [
    { id: ELTON_ID, name: ELTON_LABEL, ward: DEFAULT_WARD, href: "/s/elton", mine: false },
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

/** Ward pins for map (dedupe by ward). */
export const listWardPins = (sales: SaleRow[], selectedWard?: string | null): Pin[] => {
  const wards = new Map<string, Pin>();
  for (const s of sales) {
    const g = WARDS[s.ward] || MEGURO;
    if (!wards.has(s.ward)) {
      wards.set(s.ward, {
        id: s.ward, name: s.ward, lat: g.lat, lng: g.lng,
        mine: false, ward: s.ward,
      });
    }
  }
  return [...wards.values()].map((p) => ({
    ...p,
    mine: selectedWard ? p.ward === selectedWard : false,
  }));
};
