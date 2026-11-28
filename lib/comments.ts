"use client";
/**
 * Public item comments: shops/{shop}/items/{item}/comments/{id}.
 * Anyone can read. Posting needs Firebase auth (anonymous is fine) plus a name.
 * `seller` is only accepted by rules from the shop owner (canAdmin).
 * Per-uid cooldown lives in shops/{shop}/commentMeta/{uid}, written in the same batch.
 */
import {
  collection, doc, limit, onSnapshot, orderBy, query, serverTimestamp, writeBatch,
  deleteDoc, type Unsubscribe,
} from "firebase/firestore";
import { ensureAuth, getDb } from "./fb";
import { parseShop } from "./store";

export const COMMENT_MAX = 500;
export const NAME_MAX = 40;
export const COMMENT_COOLDOWN_S = 15;

export type Comment = {
  id: string; name: string; text: string; seller: boolean; authorUid: string; at: number;
};

export function listenComments(
  shopRaw: string, itemId: string, onRows: (rows: Comment[]) => void, onErr?: (e: Error) => void,
): Unsubscribe {
  const shop = parseShop(shopRaw);
  const q = query(
    collection(getDb(), "shops", shop, "items", itemId, "comments"),
    orderBy("at", "desc"), limit(100),
  );
  return onSnapshot(q, { includeMetadataChanges: true }, (snap) => {
    const rows = snap.docs.map((d) => {
      const x = d.data({ serverTimestamps: "estimate" });
      const at = typeof x.at?.toMillis === "function" ? x.at.toMillis() : Date.now();
      return {
        id: d.id, name: String(x.name || ""), text: String(x.text || ""),
        seller: x.seller === true, authorUid: String(x.authorUid || ""), at,
      };
    });
    onRows(rows.reverse());
  }, (e) => onErr?.(e));
}

export async function postComment(
  shopRaw: string, itemId: string, input: { name: string; text: string; seller: boolean },
): Promise<void> {
  const shop = parseShop(shopRaw);
  const name = input.name.trim().slice(0, NAME_MAX);
  const text = input.text.trim().slice(0, COMMENT_MAX);
  if (!name || !text) throw new Error("empty");
  const user = await ensureAuth();
  const db = getDb();
  const ref = doc(collection(db, "shops", shop, "items", itemId, "comments"));
  const write = async (seller: boolean) => {
    const batch = writeBatch(db);
    batch.set(doc(db, "shops", shop, "commentMeta", user.uid), { at: serverTimestamp() });
    batch.set(ref, { authorUid: user.uid, name, text, seller, at: serverTimestamp() });
    await batch.commit();
  };
  try { await write(input.seller); }
  catch (e) {
    // Local "owner" guess (LINE/soft pointer) without Firebase admin rights: post unmarked, don't lose it.
    if (input.seller && String((e as { code?: string })?.code || "").endsWith("permission-denied")) await write(false);
    else throw e;
  }
}

export async function deleteComment(shopRaw: string, itemId: string, id: string) {
  await ensureAuth();
  await deleteDoc(doc(getDb(), "shops", parseShop(shopRaw), "items", itemId, "comments", id));
}
