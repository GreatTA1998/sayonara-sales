import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const CLOSED = /受付終了|取引完了|削除/;
const yen = (s: string) => (!s || /無料|相談/.test(s) ? 0 : Number((s.replace(/,/g, "").match(/\d+/) || [0])[0]) || 0);

function profileId(raw: string) {
  const m = raw.trim().match(/jmty\.jp\/(?:s\/)?profiles\/([a-f0-9]{24})/i) || raw.trim().match(/^([a-f0-9]{24})$/i);
  return m ? m[1].toLowerCase() : null;
}

/** GET ?profile=URL|hex → ≤50 active Jimoty cards + soft-login name. */
export async function GET(req: Request) {
  try {
    const id = profileId(new URL(req.url).searchParams.get("profile") || "");
    if (!id) throw new Error("ジモティのプロフィールURL（またはID）を入力してください");
    const url = `https://jmty.jp/profiles/${id}`;
    const seen = new Set<string>();
    const items: { name: string; price: number; photo?: string; url: string }[] = [];
    let name = "";
    for (let p = 1; p <= 20 && items.length < 50; p++) {
      const res = await fetch(`${url}${p > 1 ? `?page=${p}` : ""}`, {
        headers: { "user-agent": UA, "accept-language": "ja" }, cache: "no-store",
      });
      if (!res.ok) throw new Error(res.status === 404 ? "プロフィールが見つかりません" : "ジモティ取得に失敗しました");
      const html = await res.text();
      if (!name) name = (html.match(/<title>([^<]+?)さん/) || [])[1]?.trim() || "";
      let grew = 0;
      const re = /<a class="[^"]*portal_list_link[^"]*" href="([^"]+)">([\s\S]*?)<\/a>/g;
      for (let m; (m = re.exec(html)); ) {
        const href = m[1], body = m[2];
        if (!/article-/.test(href) || CLOSED.test((body.match(/class=['"]bace['"][^>]*>\s*([^<]+)/) || [])[1] || "")) continue;
        const title = (body.match(/portal_list_title[^>]*>\s*([^<]+)/) || [])[1]?.trim();
        if (!title) continue;
        const abs = href.startsWith("http") ? href : `https://jmty.jp${href.startsWith("/") ? "" : "/"}${href}`;
        if (seen.has(abs) || items.length >= 50) continue;
        seen.add(abs); grew++;
        const photo = (body.match(/src="(https:\/\/cdn\.jmty\.jp\/articles\/[^"]+)"/) || [])[1];
        items.push({ name: title, price: yen((body.match(/<b>\s*([^<]+)/) || [])[1] || ""), url: abs, ...(photo ? { photo } : {}) });
      }
      if (!grew) break;
    }
    if (!items.length) throw new Error("公開中の出品が見つかりません");
    return NextResponse.json({ id, name, url, items });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "失敗しました" }, { status: 400 });
  }
}
