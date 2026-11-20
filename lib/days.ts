/** Shared JP pickup-day labels (YYYY-MM-DD). */

const WK = "月火水木金土日";
const YMD = /^\d{4}-\d{2}-\d{2}$/;

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

/** Inclusive YYYY-MM-DD range → day list (cap 60). */
export function daysBetween(from: string, to: string): string[] {
  if (!YMD.test(from) || !YMD.test(to) || to < from) return [];
  const out: string[] = [];
  const cur = new Date(Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10)));
  const end = new Date(Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10)));
  for (let i = 0; i < 60 && cur <= end; i++) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

/** Sale window for the buyer top bar, e.g. 11月1日–11月8日 */
export function pickupSpan(days: string[]) {
  if (!days.length) return "";
  return `${dayShort(days[0])}–${dayShort(days[days.length - 1])}`;
}
