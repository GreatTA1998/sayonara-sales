/** Soft LINE shop id (client). Blob multi-key = TODO in store. */
export const NAME_KEY = "ss-line-name";
export const slugify = (n: string) => encodeURIComponent(n.trim().toLowerCase().replace(/\s+/g, "-"));
export const unslug = (s: string) => { try { return decodeURIComponent(s); } catch { return s; } };
export const getName = () => typeof window === "undefined" ? "" : (localStorage.getItem(NAME_KEY) || "").trim();
export const setName = (n: string) => {
  const v = n.trim();
  if (v) localStorage.setItem(NAME_KEY, v); else localStorage.removeItem(NAME_KEY);
  return v;
};
