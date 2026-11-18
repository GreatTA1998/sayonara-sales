/** Shared JP pickup-day labels + late-window helpers (YYYY-MM-DD). */
import { LATE_FROM } from "./sale";

const WK = "月火水木金土日";

export { LATE_FROM };
export const isLateOnly = (it: { availableFrom?: string; availableTo?: string }) =>
  !!it.availableFrom && it.availableFrom === LATE_FROM && !it.availableTo;

export function youbi(d: string) {
  const [y, m, day] = d.split("-").map(Number);
  return WK[(new Date(Date.UTC(y, m - 1, day)).getUTCDay() + 6) % 7];
}

export function dayLbl(d: string) {
  const [, m, day] = d.split("-").map(Number);
  return `${m}月${day}日（${youbi(d)}）`;
}

export function dayShort(d: string) {
  const [, m, day] = d.split("-").map(Number);
  return `${m}月${day}日`;
}

/** Sale window for the buyer top bar, e.g. 11月1日–11月8日 */
export function pickupSpan(days: string[]) {
  if (!days.length) return "";
  return `${dayShort(days[0])}–${dayShort(days[days.length - 1])}`;
}

export function rangeLbl(from?: string, to?: string) {
  if (!from && !to) return "";
  if (from && to) {
    const [, m1, d1] = from.split("-").map(Number);
    const [, m2, d2] = to.split("-").map(Number);
    if (m1 === m2) return `${m1}月${d1}日–${d2}日`;
    return `${dayShort(from)}–${dayShort(to)}`;
  }
  return from ? `${dayShort(from)}以降` : `${dayShort(to!)}まで`;
}
