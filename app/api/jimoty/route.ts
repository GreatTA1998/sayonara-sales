import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const CLOSED = /受付終了|取引完了|削除/;
const yen = (s: string) => (!s || /無料|相談/.test(s) ? 0 : Number((s.replace(/,/g, "").match(/\d+/) || [0])[0]) || 0);
const hdr = { "user-agent": UA, "accept-language": "ja" };

type Item = { name: string; price: number; photo?: string; url: string };

function profileId(raw: string) {
  const m = raw.trim().match(/jmty\.jp\/(?:s\/)?profiles\/([a-f0-9]{24})/i) || raw.trim().match(/^([a-f0-9]{24})$/i);
  return m ? m[1].toLowerCase() : null;
}

async function html(url: string) {
  const res = await fetch(url, { headers: hdr, cache: "no-store" });
  if (!res.ok) throw new Error(res.status === 404 ? "見つかりません" : "ジモティ取得に失敗しました");
  return res.text();
}

function parseItems(page: string, seen: Set<string>, items: Item[], cap: number) {
  let grew = 0;
  const re = /<a class="[^"]*portal_list_link[^"]*" href="([^"]+)">([\s\S]*?)<\/a>/g;
  for (let m; (m = re.exec(page)); ) {
    const href = m[1], body = m[2];
    if (!/article-/.test(href) || CLOSED.test((body.match(/class=['"]bace['"][^>]*>\s*([^<]+)/) || [])[1] || "")) continue;
    const title = (body.match(/portal_list_title[^>]*>\s*([^<]+)/) || [])[1]?.trim();
    if (!title) continue;
    const abs = href.startsWith("http") ? href : `https://jmty.jp${href.startsWith("/") ? "" : "/"}${href}`;
    if (seen.has(abs) || items.length >= cap) continue;
    seen.add(abs); grew++;
    const photo = (body.match(/src="(https:\/\/cdn\.jmty\.jp\/articles\/[^"]+)"/) || [])[1];
    items.push({ name: title, price: yen((body.match(/<b>\s*([^<]+)/) || [])[1] || ""), url: abs, ...(photo ? { photo } : {}) });
  }
  return grew;
}

async function scrapeProfile(id: string, cap = 50, maxPages = 20) {
  const url = `https://jmty.jp/profiles/${id}`;
  const seen = new Set<string>();
  const items: Item[] = [];
  let name = "";
  for (let p = 1; p <= maxPages && items.length < cap; p++) {
    const page = await html(`${url}${p > 1 ? `?page=${p}` : ""}`);
    if (!name) name = (page.match(/<title>([^<]+?)さん/) || [])[1]?.trim() || "";
    if (!parseItems(page, seen, items, cap)) break;
  }
  return { id, name, url, items };
}

/** Yahoo → Jimoty articles → seller profile whose nickname matches exactly. */
async function resolveName(name: string) {
  const q = encodeURIComponent(`${name} site:jmty.jp`);
  const page = await html(`https://search.yahoo.co.jp/search?p=${q}`);
  const arts: string[] = [];
  for (const m of page.matchAll(/https:\/\/jmty\.jp\/(?:s\/)?([a-z0-9-]+\/sale[^"?\s]*article-[a-z0-9]+)/gi)) {
    const u = `https://jmty.jp/${m[1]}`;
    if (!arts.includes(u)) arts.push(u);
    if (arts.length >= 8) break;
  }
  const ids: string[] = [];
  for (const a of arts) {
    try {
      const h = await html(a);
      const m = h.match(/href="\/(?:s\/)?profiles\/([a-f0-9]{24})"\s*>([^<]+)/i);
      if (!m || m[2].trim() !== name) continue;
      const id = m[1].toLowerCase();
      if (!ids.includes(id)) ids.push(id);
    } catch { /* skip dead links */ }
  }
  return ids;
}

/** GET ?name=ジモティ名&preview=1 | ?profile=URL|hex → listings / confirm preview. */
export async function GET(req: Request) {
  try {
    const sp = new URL(req.url).searchParams;
    const preview = sp.get("preview") === "1";
    const rawName = (sp.get("name") || "").trim();
    let id = profileId(sp.get("profile") || rawName);

    if (!id) {
      if (!rawName) throw new Error("ジモティ名を入力してください");
      const ids = await resolveName(rawName);
      if (!ids.length) throw new Error("そのジモティ名の出品が見つかりません");
      if (ids.length > 1 && preview) {
        const candidates = [];
        for (const cand of ids.slice(0, 4)) {
          const s = await scrapeProfile(cand, 4, 1);
          candidates.push({ id: s.id, name: s.name || rawName, url: s.url, count: s.items.length, samples: s.items });
        }
        return NextResponse.json({ candidates });
      }
      id = ids[0];
    }

    const data = await scrapeProfile(id, preview ? 6 : 50, preview ? 1 : 20);
    if (!data.items.length) throw new Error("公開中の出品が見つかりません");
    if (preview) {
      return NextResponse.json({
        id: data.id, name: data.name, url: data.url,
        count: data.items.length, samples: data.items.slice(0, 4),
      });
    }
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "失敗しました" }, { status: 400 });
  }
}
