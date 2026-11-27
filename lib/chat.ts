"use client";
/**
 * In-app chat — threads + messages. Soft/LINE buyers use buyerUid;
 * sellers pass owned shopId. Inbox = flat last-msg rows (返信 → full thread).
 */
import {
  collection, doc, getDoc, limit, onSnapshot, orderBy, query, setDoc, updateDoc,
  where, type Unsubscribe,
} from "firebase/firestore";
import { ensureAuth, getDb } from "./fb";
import { uid } from "./store";

export type ChatMsg = {
  id: string; text: string; by: string; at: string; role: "buyer" | "seller";
};
export type ChatThread = {
  id: string; shopId: string; claimId: string; label: string;
  buyerUid: string; sellerUid: string; contact: string;
  lastText: string; lastAt: string; lastBy: string; lastRole: "buyer" | "seller";
  unreadBuyer: number; unreadSeller: number;
};

const threadId = (shop: string, claimId: string) => `${shop}_${claimId}`;

export function threadFields(t: Omit<ChatThread, "id">): Record<string, unknown> {
  return {
    shopId: t.shopId, claimId: t.claimId, label: t.label,
    buyerUid: t.buyerUid, sellerUid: t.sellerUid || "", contact: t.contact || "",
    lastText: t.lastText, lastAt: t.lastAt, lastBy: t.lastBy, lastRole: t.lastRole,
    unreadBuyer: t.unreadBuyer | 0, unreadSeller: t.unreadSeller | 0,
  };
}

function asThread(id: string, r: Record<string, unknown>): ChatThread {
  return {
    id, shopId: String(r.shopId || ""), claimId: String(r.claimId || ""),
    label: String(r.label || ""), buyerUid: String(r.buyerUid || ""),
    sellerUid: String(r.sellerUid || ""), contact: String(r.contact || ""),
    lastText: String(r.lastText || ""), lastAt: String(r.lastAt || ""),
    lastBy: String(r.lastBy || ""),
    lastRole: r.lastRole === "seller" ? "seller" : "buyer",
    unreadBuyer: Number(r.unreadBuyer || 0), unreadSeller: Number(r.unreadSeller || 0),
  };
}

function mergeThreads(a: ChatThread[], b: ChatThread[]): ChatThread[] {
  const m = new Map<string, ChatThread>();
  for (const t of [...a, ...b]) m.set(t.id, t);
  return [...m.values()].sort((x, y) => (y.lastAt || "").localeCompare(x.lastAt || ""));
}

/** Open thread on アプリ内 book — seed buyer note so it lands in both inboxes. */
export async function openAppThread(opts: {
  shopId: string; claimId: string; label: string; contact: string; sellerUid?: string;
}): Promise<string> {
  const user = await ensureAuth();
  const id = threadId(opts.shopId, opts.claimId);
  const at = new Date().toISOString();
  const text = "アプリ内でやり取り希望です。";
  const ref = doc(getDb(), "threads", id);
  if ((await getDoc(ref)).exists()) return id;
  await setDoc(ref, threadFields({
    shopId: opts.shopId, claimId: opts.claimId, label: opts.label || "チャット",
    buyerUid: user.uid, sellerUid: opts.sellerUid || "", contact: opts.contact,
    lastText: text, lastAt: at, lastBy: user.uid, lastRole: "buyer",
    unreadBuyer: 0, unreadSeller: 1,
  }));
  await setDoc(doc(getDb(), "threads", id, "messages", uid("m")), {
    text, by: user.uid, at, role: "buyer",
  });
  return id;
}

/** Live inbox: buyerUid==me ∪ shopId==ownedShop. */
export function listenInbox(ownedShop: string, onData: (rows: ChatThread[]) => void): Unsubscribe {
  let dead = false;
  let buyer: ChatThread[] = [];
  let seller: ChatThread[] = [];
  let stopBuyer: Unsubscribe | null = null;
  let stopSeller: Unsubscribe | null = null;
  const emit = () => { if (!dead) onData(mergeThreads(buyer, seller)); };

  void ensureAuth().then((user) => {
    if (dead) return;
    const db = getDb();
    stopBuyer = onSnapshot(
      query(collection(db, "threads"), where("buyerUid", "==", user.uid), limit(40)),
      (snap) => {
        buyer = snap.docs.map((d) => asThread(d.id, d.data() as Record<string, unknown>));
        emit();
      },
      () => { buyer = []; emit(); },
    );
    if (!ownedShop) { seller = []; emit(); return; }
    stopSeller = onSnapshot(
      query(collection(db, "threads"), where("shopId", "==", ownedShop), limit(40)),
      (snap) => {
        seller = snap.docs.map((d) => asThread(d.id, d.data() as Record<string, unknown>));
        emit();
      },
      () => { seller = []; emit(); },
    );
  }).catch(() => { if (!dead) onData([]); });

  return () => { dead = true; stopBuyer?.(); stopSeller?.(); };
}

/** Unread for nav badge. */
export function listenUnread(ownedShop: string, onN: (n: number) => void): Unsubscribe {
  return listenInbox(ownedShop, (rows) => {
    void ensureAuth().then((user) => {
      let n = 0;
      for (const t of rows) {
        if (t.buyerUid === user.uid) n += t.unreadBuyer;
        if (ownedShop && t.shopId === ownedShop) n += t.unreadSeller;
      }
      onN(n);
    }).catch(() => onN(0));
  });
}

export function listenThread(
  id: string,
  onThread: (t: ChatThread | null) => void,
  onMsgs: (m: ChatMsg[]) => void,
): Unsubscribe {
  let dead = false;
  let stopT: Unsubscribe | null = null;
  let stopM: Unsubscribe | null = null;
  void ensureAuth().then(() => {
    if (dead) return;
    const db = getDb();
    stopT = onSnapshot(doc(db, "threads", id), (snap) => {
      onThread(snap.exists() ? asThread(snap.id, snap.data() as Record<string, unknown>) : null);
    }, () => onThread(null));
    stopM = onSnapshot(
      query(collection(db, "threads", id, "messages"), orderBy("at", "asc"), limit(200)),
      (snap) => {
        onMsgs(snap.docs.map((d) => {
          const r = d.data();
          return {
            id: d.id, text: String(r.text || ""), by: String(r.by || ""),
            at: String(r.at || ""), role: r.role === "seller" ? "seller" : "buyer",
          } as ChatMsg;
        }));
      },
      () => onMsgs([]),
    );
  }).catch(() => { onThread(null); onMsgs([]); });
  return () => { dead = true; stopT?.(); stopM?.(); };
}

export async function markThreadRead(id: string, as: "buyer" | "seller") {
  await ensureAuth();
  try {
    await updateDoc(doc(getDb(), "threads", id), as === "buyer" ? { unreadBuyer: 0 } : { unreadSeller: 0 });
  } catch { /* offline / rules lag */ }
}

export async function sendChat(id: string, text: string, ownedShop: string): Promise<void> {
  const body = text.trim();
  if (!body) return;
  const user = await ensureAuth();
  const db = getDb();
  const ref = doc(db, "threads", id);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("チャットが見つかりません");
  const t = asThread(id, snap.data() as Record<string, unknown>);
  const asSeller = !!ownedShop && t.shopId === ownedShop && t.buyerUid !== user.uid;
  const role: "buyer" | "seller" = asSeller ? "seller" : "buyer";
  if (role === "buyer" && t.buyerUid !== user.uid) throw new Error("送信できません");
  const at = new Date().toISOString();
  await setDoc(doc(db, "threads", id, "messages", uid("m")), {
    text: body, by: user.uid, at, role,
  });
  await updateDoc(ref, {
    lastText: body.slice(0, 200), lastAt: at, lastBy: user.uid, lastRole: role,
    ...(role === "buyer"
      ? { unreadSeller: (t.unreadSeller || 0) + 1, unreadBuyer: 0 }
      : { unreadBuyer: (t.unreadBuyer || 0) + 1, unreadSeller: 0 }),
  });
}

/** Compact relative time for inbox rows. */
export function chatWhen(iso: string): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const d = new Date(t);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }
  const yest = new Date(now); yest.setDate(yest.getDate() - 1);
  if (d.toDateString() === yest.toDateString()) return "昨日";
  const days = ["日", "月", "火", "水", "木", "金", "土"];
  if (now.getTime() - t < 7 * 864e5) return days[d.getDay()];
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
