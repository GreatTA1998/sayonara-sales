"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import "./item-comments.css";
import { ensureAuth } from "@/lib/fb";
import {
  COMMENT_COOLDOWN_S, COMMENT_MAX, deleteComment, listenComments, NAME_MAX, postComment, type Comment,
} from "@/lib/comments";
import { t, useLang } from "@/lib/lang";
import { getName, subscribeAuth } from "@/lib/shop";

const NAME_KEY = "ss-cmt-name";
const readName = () => { try { return localStorage.getItem(NAME_KEY) || ""; } catch { return ""; } };

/**
 * Public Q&A under an item. Signed-in (soft/LINE name) posts as that name; others type
 * a name (anonymous Firebase auth + per-uid cooldown in rules). Owner replies carry the
 * seller tag, which rules only accept from the shop admin.
 */
export function ItemComments({ shop, itemId, isOwner }: { shop: string; itemId: string; isOwner: boolean }) {
  const lang = useLang();
  const known = useSyncExternalStore(subscribeAuth, getName, () => "");
  const [rows, setRows] = useState<Comment[] | null>(null);
  const [uid, setUid] = useState("");
  const [guest, setGuest] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [last, setLast] = useState(0);

  useEffect(() => { setGuest(readName()); }, []);
  useEffect(() => {
    let dead = false;
    void ensureAuth().then((u) => { if (!dead) setUid(u.uid); }).catch(() => {});
    return () => { dead = true; };
  }, []);
  useEffect(() => {
    setRows(null); setMsg("");
    return listenComments(shop, itemId, setRows, () => { setRows([]); setMsg(t("cmt.load", lang)); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shop, itemId]);

  const name = (known || guest).trim();
  const can = !!name && !!text.trim() && !busy;

  async function send() {
    if (!can) return;
    if (Date.now() - last < COMMENT_COOLDOWN_S * 1000) { setMsg(t("cmt.wait", lang)); return; }
    setBusy(true); setMsg("");
    try {
      await postComment(shop, itemId, { name, text, seller: isOwner });
      if (!known) { try { localStorage.setItem(NAME_KEY, name); } catch { /* ignore */ } }
      setText(""); setLast(Date.now());
    } catch { setMsg(t("cmt.fail", lang)); }
    finally { setBusy(false); }
  }

  async function del(id: string) {
    if (!window.confirm(t("cmt.delAsk", lang))) return;
    try { await deleteComment(shop, itemId, id); } catch { setMsg(t("cmt.fail", lang)); }
  }

  const when = (ms: number) =>
    new Date(ms).toLocaleString(lang === "ja" ? "ja-JP" : "en-US",
      { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

  return (
    <section className="cmt" aria-label={t("cmt.title", lang)}>
      <h3 className="cmt-h">{t("cmt.title", lang)}{rows?.length ? ` (${rows.length})` : ""}</h3>
      {rows && rows.length === 0 && !msg ? <p className="hint">{t("cmt.empty", lang)}</p> : null}
      {rows && rows.length > 0 ? (
        <ul className="cmt-list">
          {rows.map((c) => (
            <li key={c.id} className={c.seller ? "cmt-row seller" : "cmt-row"}>
              <div className="cmt-meta">
                <b>{c.name}</b>
                {c.seller ? <span className="cmt-tag">{t("cmt.seller", lang)}</span> : null}
                <span>{when(c.at)}</span>
                {isOwner || (uid && c.authorUid === uid) ? (
                  <button type="button" className="cmt-del" onClick={() => void del(c.id)}>{t("cmt.del", lang)}</button>
                ) : null}
              </div>
              <p className="cmt-txt">{c.text}</p>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="cmt-form">
        {!known ? (
          <input value={guest} maxLength={NAME_MAX} placeholder={t("cmt.name", lang)} aria-label={t("cmt.name", lang)}
            autoComplete="nickname" onChange={(e) => setGuest(e.target.value)} />
        ) : null}
        <textarea value={text} maxLength={COMMENT_MAX} placeholder={t("cmt.ph", lang)} aria-label={t("cmt.ph", lang)}
          rows={2} onChange={(e) => setText(e.target.value)} />
        <div className="cmt-send">
          <p className={msg ? "err" : "hint"} style={msg ? { padding: 0 } : undefined}>{msg}</p>
          <button type="button" disabled={!can} onClick={() => void send()}>{t("cmt.post", lang)}</button>
        </div>
      </div>
    </section>
  );
}
