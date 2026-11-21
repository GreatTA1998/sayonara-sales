const WK = "月火水木金土日";
const YMD = /^\d{4}-\d{2}-\d{2}$/;

function youbi(d: string) {
  const [y, m, day] = d.split("-").map(Number);
  return WK[(new Date(Date.UTC(y, m - 1, day)).getUTCDay() + 6) % 7];
}

export function dayLbl(d: string) {
  const [, m, day] = d.split("-").map(Number);
  return `${m}月${day}日（${youbi(d)}）`;
}

function dayShort(d: string) {
  const [, m, day] = d.split("-").map(Number);
  return `${m}月${day}日`;
}

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

export const tokyoYmd = (d = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

export function addDays(ymd: string, n: number) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function pickupSpan(days: string[]) {
  if (!days.length) return "";
  return `${dayShort(days[0])}–${dayShort(days[days.length - 1])}`;
}
