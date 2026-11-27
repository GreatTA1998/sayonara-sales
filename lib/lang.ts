"use client";
import { useSyncExternalStore } from "react";

/** Persist: `ja` | BCP-47 primary (e.g. `en`). */
export const LANG_KEY = "ss-lang";
const EVT = "ss-lang";

/** [ja, en] — chrome only; listing seller text stays JP. */
const S: Record<string, [string, string]> = {
  "nav.post": ["投稿", "Post"],
  "nav.listings": ["投稿一覧", "My listings"],
  "nav.help": ["ヘルプ", "Help"],
  "nav.login": ["ログイン", "Log in"],
  "nav.home": ["サヨナラ ホーム", "Sayonara home"],
  "nav.req": ["依頼{n}件", "{n} requests"],
  "me.title": ["マイページ", "Account"],
  "me.logout": ["ログアウト", "Log out"],
  "me.lineSecure": ["LINEでセキュアにログイン中", "Signed in securely with LINE"],
  "me.lineLater": ["任意：あとでLINEでアカウントを保護できます", "Optional: secure this account with LINE later"],
  "me.lineName": ["LINE名", "LINE name"],
  "me.jimotyName": ["ジモティー名", "Jimoty name"],
  "me.facebookName": ["Facebook名", "Facebook name"],
  "me.buys": ["買う · 引き取り履歴", "Buys · pickup history"],
  "me.cancel": ["キャンセル", "Cancel"],
  "me.resched": ["日程変更", "Reschedule"],
  "me.reschedGo": ["変更する", "Confirm"],
  "me.back": ["戻る", "Back"],
  "me.cancelOk": ["キャンセルしました", "Cancelled"],
  "me.reschedOk": ["日程を変更しました", "Rescheduled"],
  "me.buyNoAct": ["変更できる予約ではありません", "This reservation can't be changed"],
  "me.lang": ["表示言語", "Language"],
  "login.aria": ["ログイン", "Log in"],
  "login.seg": ["ソフトログイン", "Soft login"],
  "login.jimoty": ["ジモティー名", "Jimoty"],
  "login.line": ["LINE名", "LINE"],
  "login.facebook": ["Facebook名", "Facebook"],
  "login.signIn": ["パスワードなしでサインイン", "Sign in without a password"],
  "login.or": ["または", "or"],
  "login.lineNeed": ["このアカウントはLINEログインが必要です", "This account requires LINE login"],
  "login.hint": ["任意：あとでLINEでアカウントを保護できます", "Optional: secure this account with LINE later"],
  "home.slogan": ["効率的なお引越しセール", "Efficient move-out sales"],
  "home.prose": ["元のプラットフォームから出品を自動取り込み。どこにでもシェアできるリンク。予約済がすぐ見えるので、まとめ買いの予定も衝突なし。確定したら、いつもの安心できる連絡先でメッセージを。", "Auto-import listings from the original platform. A link you can share anywhere. See what's reserved right away, so bulk pickups stay clash-free. Once confirmed, message on your usual trusted contact."],
  "home.tabs": ["ショップ一覧", "Shops"],
  "home.copy": ["URLコピー", "Copy URL"],
  "home.copied": ["コピーしました", "Copied"],
  "home.loading": ["読み込み中…", "Loading…"],
  "claim.busy": ["クレーム中…", "Claiming…"],
  "claim.taken": ["すでに他の人がクレーム済みです", "Someone else already claimed this shop"],
  "claim.other": ["すでに別のショップをクレーム済みです（1アカウント1ショップ）", "You already claimed another shop (one shop per account)"],
  "claim.manage": ["出品を管理", "Manage listings"],
  "splash.msg": ["このストアは日本語です。{lang}に翻訳しますか？", "This store is in Japanese. Translate to {lang}?"],
  "splash.yes": ["{lang}に翻訳", "Translate to {lang}"],
  "splash.stay": ["日本語のまま", "Stay in 日本語"],
  "splash.note": ["アカウント設定でいつでも変更できます。", "You can change this anytime in account settings."],
  "lang.ja": ["日本語", "日本語"],
  "lang.en": ["英語", "English"],
  "buy.cta": ["引き取りを依頼", "Request pickup"],
  "buy.ctaN": ["引き取りを依頼 ({n})", "Request pickup ({n})"],
  "badge.req": ["依頼中", "Requested"],
  "badge.booked": ["予約済", "Reserved"],
  "badge.sold": ["引取済", "Picked up"],
  "badge.reqN": ["{n}人依頼中", "{n} requesting"],
  "sort.layout": ["表示", "Layout"],
  "sort.price": ["価格順", "Price"],
  "sort.asc": ["安い順", "Low to high"],
  "sort.desc": ["高い順", "High to low"],
  "sort.spacious": ["通常", "Spacious"],
  "sort.dense": ["密集", "Dense"],
  "filter.sold": ["引取済", "Picked up"],
};

export function detectBrowserLang(): string {
  if (typeof navigator === "undefined") return "en";
  const raw = (navigator.languages?.[0] || navigator.language || "en").toLowerCase();
  return raw.split("-")[0] || "en";
}

export function isJa(tag: string) {
  const x = tag.toLowerCase();
  return x === "ja" || x.startsWith("ja-");
}

export function getSavedLang(): string | null {
  try {
    const v = (localStorage.getItem(LANG_KEY) || "").trim();
    return v || null;
  } catch { return null; }
}

/** Effective UI lang — Japanese until they pick. */
export function getLang(): string {
  return getSavedLang() || "ja";
}

/** Chrome target for detected browser lang (en first; more langs later). */
export function offerLang(detected = detectBrowserLang()): string {
  if (isJa(detected)) return "ja";
  return "en";
}

/** Sync <html lang> + CSS ::after badge vars (--b-req/booked/sold). */
export function applyLangDom(lang: string) {
  if (typeof document === "undefined") return;
  const r = document.documentElement;
  r.lang = isJa(lang) ? "ja" : lang;
  for (const [css, key] of [
    ["--b-req", "badge.req"],
    ["--b-booked", "badge.booked"],
    ["--b-sold", "badge.sold"],
  ] as const) {
    r.style.setProperty(css, JSON.stringify(t(key, lang)));
  }
}

export function setLang(tag: string) {
  const v = (tag || "ja").trim() || "ja";
  try { localStorage.setItem(LANG_KEY, v); } catch { /* ignore */ }
  applyLangDom(v);
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVT));
}

export function needSplash(): boolean {
  return !getSavedLang() && !isJa(detectBrowserLang());
}

export function langLabel(tag: string, inLang = tag): string {
  const pair = S[`lang.${tag}`];
  if (pair) return isJa(inLang) ? pair[0] : pair[1];
  try { return new Intl.DisplayNames([inLang], { type: "language" }).of(tag) || tag; }
  catch { return tag; }
}

export function t(key: string, lang = getLang(), vars?: Record<string, string | number>): string {
  const pair = S[key];
  let s = pair ? (isJa(lang) ? pair[0] : pair[1]) : key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

function subscribe(cb: () => void) {
  window.addEventListener(EVT, cb);
  window.addEventListener("storage", cb);
  return () => { window.removeEventListener(EVT, cb); window.removeEventListener("storage", cb); };
}

export function useLang() {
  return useSyncExternalStore(subscribe, getLang, () => "ja");
}

export function useNeedSplash() {
  return useSyncExternalStore(subscribe, needSplash, () => false);
}
