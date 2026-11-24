export const PICKUP_SLOTS = ["10:00–10:15", "14:00–14:15", "20:00–20:15"];
export const DEF_LEAD = 2;

/** Seller polite-decline presets (requested claims). */
export const DECLINE_PRESETS = [
  "申し訳ございません。まとめ買いの方を優先しており、今回はお受けできません。",
  "申し訳ございません。ご希望の日程ではご案内が難しいです。",
  "申し訳ございません。先にご依頼のあった方を優先しております。",
  "申し訳ございません。今回はご案内が難しく、お断りさせていただきます。",
] as const;

export const CANON_LINE = "https://line.me/ti/p/yBg2x2X_ut";
export const CANON_PHONE = "080-4919-2027";

export const telHref = (phone: string) => {
  const d = phone.replace(/\D/g, "");
  if (!d) return "tel:";
  if (d.startsWith("0")) return `tel:+81${d.slice(1)}`;
  if (d.startsWith("81")) return `tel:+${d}`;
  return `tel:${d}`;
};

export const ytUrl = (s: string) => {
  const m = s.match(
    /https?:\/\/(?:www\.)?(?:youtu\.be\/[\w-]+(?:\?[^\s]*)?|youtube\.com\/(?:watch\?[^\s]*|shorts\/[\w-]+))/i,
  );
  return m ? m[0].replace(/[)\].,;]+$/, "") : "";
};

export type PriceDir = "asc" | "desc";
const priced = (p: number | null | undefined) => p != null;

export function byPrice(dir: PriceDir) {
  return <T extends { id: string; price: number | null }>(a: T, b: T) => {
    const pa = priced(a.price);
    const pb = priced(b.price);
    if (pa !== pb) return pa ? -1 : 1;
    if (pa && pb) {
      const d = dir === "asc" ? (a.price! - b.price!) : (b.price! - a.price!);
      if (d) return d;
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  };
}
