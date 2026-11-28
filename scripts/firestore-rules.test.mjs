/**
 * Unclaimed shops are editable/publishable by any signed-in or anonymous user.
 * Claimed shops are owner-only. Claim still works after those edits.
 * Run: npm run test:rules
 */
import { readFileSync } from "fs";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import {
  doc, getDoc, setDoc, updateDoc, runTransaction, deleteDoc, writeBatch, serverTimestamp, Timestamp,
} from "firebase/firestore";

const hostEnv = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";
const [host, portStr] = hostEnv.split(":");
const rules = readFileSync(new URL("../firestore.rules", import.meta.url), "utf8");

const testEnv = await initializeTestEnvironment({
  projectId: "demo-sayonara",
  firestore: { rules, host, port: Number(portStr) },
});

let n = 0;
const user = (name, provider) => {
  n += 1;
  const uid = `${name}-${n}`;
  const db = testEnv.authenticatedContext(uid, {
    firebase: { sign_in_provider: provider },
  }).firestore();
  return { uid, db };
};

const outcome = async (p) => {
  try { await p; return "ALLOW"; }
  catch (e) { return `DENY ${e.code || ""}`.trim(); }
};

const fails = [];
const check = (name, ok) => {
  console.log(`${ok ? "ok" : "FAIL"} ${name}`);
  if (!ok) fails.push(name);
};
const shop = (db, id) => doc(db, "shops", id);
const draft = () => ({
  address: "", bio: "", published: false, updatedAt: "t0",
});

await testEnv.clearFirestore();

{
  const anon = user("anon", "anonymous");
  check("anonymous creates shop", (await outcome(setDoc(shop(anon.db, "10001"), draft()))) === "ALLOW");
  const other = user("signed", "password");
  check("other user edits unclaimed shop", (await outcome(updateDoc(shop(other.db, "10001"), {
    address: "目黒区", bio: "note", updatedAt: "t1",
  }))) === "ALLOW");
  check("other user adds item", (await outcome(setDoc(doc(other.db, "shops", "10001", "items", "i1"), {
    name: "chair", price: 100, photos: ["https://blob.example/a.webp"], pos: 0,
  }))) === "ALLOW");
  const saved = await getDoc(shop(other.db, "10001"));
  check("edit did not claim or publish", !saved.data().ownerUid && saved.data().published === false && saved.data().address === "目黒区");
  check("edit cannot set ownerUid", (await outcome(updateDoc(shop(other.db, "10001"), { ownerUid: other.uid }))).startsWith("DENY"));
  check("unclaimed can publish", (await outcome(updateDoc(shop(other.db, "10001"), { published: true }))) === "ALLOW");
  check("publish did not claim", !(await getDoc(shop(other.db, "10001"))).data().ownerUid);

  const seller = user("seller", "anonymous");
  const ref = shop(seller.db, "10001");
  const uref = doc(seller.db, "uids", seller.uid);
  check("different user claims after edits", (await outcome(runTransaction(seller.db, async (tx) => {
    const [, usnap] = await Promise.all([tx.get(ref), tx.get(uref)]);
    if (!usnap.exists()) tx.set(uref, { shopId: "10001" });
    tx.update(ref, { ownerUid: seller.uid, updatedAt: "t2", ownerFacebookName: "Seller" });
  }))) === "ALLOW");
  const claimed = await getDoc(ref);
  check("seller is owner", claimed.data().ownerUid === seller.uid && claimed.data().address === "目黒区");
  check("non-owner cannot edit claimed shop", (await outcome(updateDoc(shop(other.db, "10001"), { address: "hack" }))).startsWith("DENY"));
  check("non-owner cannot add item", (await outcome(setDoc(doc(anon.db, "shops", "10001", "items", "i9"), { name: "x" }))).startsWith("DENY"));
  check("owner can edit", (await outcome(updateDoc(ref, { bio: "mine", updatedAt: "t3" }))) === "ALLOW");
}

{
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "shops", "10002"), draft());
  });
  const guest = testEnv.unauthenticatedContext().firestore();
  check("no auth cannot edit unclaimed shop", (await outcome(updateDoc(shop(guest, "10002"), { address: "x" }))).startsWith("DENY"));
}

{
  const { db } = user("elton", "anonymous");
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "shops", "elton"), { address: "目黒区", published: true, ownerUid: "someone" });
  });
  check("elton still editable", (await outcome(updateDoc(shop(db, "elton"), { address: "目黒区2" }))) === "ALLOW");
}

{
  const buyer = user("buyer", "anonymous");
  const other = user("other", "anonymous");
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const fs = ctx.firestore();
    await setDoc(doc(fs, "shops", "10003"), { address: "目黒区", published: true, ownerUid: "seller-x" });
    await setDoc(doc(fs, "shops", "10003", "items", "i1"), { name: "傘", price: 100, claimId: "c1", pos: 0 });
    await setDoc(doc(fs, "shops", "10003", "claims", "c1"), {
      code: "ABCD", day: "2026-11-27", slot: "10:00", itemIds: ["i1"],
      status: "booked", buyerUid: buyer.uid, contact: "みるく", waiters: [],
    });
  });
  const cref = doc(buyer.db, "shops", "10003", "claims", "c1");
  const iref = doc(buyer.db, "shops", "10003", "items", "i1");
  check("buyer can reschedule own claim", (await outcome(updateDoc(cref, {
    day: "2026-11-28", slot: "14:00",
  }))) === "ALLOW");
  check("other cannot reschedule", (await outcome(updateDoc(doc(other.db, "shops", "10003", "claims", "c1"), {
    day: "2026-11-29", slot: "10:00",
  }))).startsWith("DENY"));
  check("other cannot clear claimId", (await outcome(updateDoc(doc(other.db, "shops", "10003", "items", "i1"), {
    claimId: null,
  }))).startsWith("DENY"));
  check("buyer can cancel own claim", (await outcome(updateDoc(cref, {
    status: "cancelled", waiters: [],
  }))) === "ALLOW");
  check("buyer can clear item claimId after cancel", (await outcome(updateDoc(iref, {
    claimId: null,
  }))) === "ALLOW");
}

{
  // Soft みるく: no buyerUid match — Auth token.name == contact.
  n += 1;
  const softUid = `soft-milk-${n}`;
  const soft = testEnv.authenticatedContext(softUid, {
    firebase: { sign_in_provider: "anonymous" }, name: "みるく",
  }).firestore();
  const spoof = testEnv.authenticatedContext(`spoof-${n}`, {
    firebase: { sign_in_provider: "anonymous" }, name: "別人",
  }).firestore();
  // dig5 (not elton): elton is writable by any signed-in anon via canAdmin.
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const fs = ctx.firestore();
    await setDoc(doc(fs, "shops", "10004"), { address: "目黒区", published: true, ownerUid: "seller-y" });
    await setDoc(doc(fs, "shops", "10004", "items", "i-milk"), {
      name: "傘まとめ", price: 500, claimId: "c-milk", pos: 0,
    });
    await setDoc(doc(fs, "shops", "10004", "claims", "c-milk"), {
      code: "MILK", day: "2026-11-27", slot: "10:00", itemIds: ["i-milk"],
      status: "booked", contact: "みるく", waiters: [],
      // buyerUid from a different anon session — soft re-login won't match.
      buyerUid: "other-anon-session",
    });
  });
  const cref = doc(soft, "shops", "10004", "claims", "c-milk");
  const iref = doc(soft, "shops", "10004", "items", "i-milk");
  const spoofRef = doc(spoof, "shops", "10004", "claims", "c-milk");
  check("soft contact can reschedule", (await outcome(updateDoc(cref, {
    day: "2026-11-28", slot: "14:00",
  }))) === "ALLOW");
  check("wrong soft name cannot reschedule", (await outcome(updateDoc(spoofRef, {
    day: "2026-11-29", slot: "10:00",
  }))).startsWith("DENY"));
  check("soft contact can cancel", (await outcome(updateDoc(cref, {
    status: "cancelled", waiters: [],
  }))) === "ALLOW");
  check("soft contact can clear claimId", (await outcome(updateDoc(iref, {
    claimId: null,
  }))) === "ALLOW");
}

// Public item comments (shops/{shop}/items/{item}/comments) + per-uid cooldown (commentMeta).
{
  const owner = user("cowner", "password");
  const buyer = user("cbuyer", "anonymous");
  const buyer2 = user("cbuyer2", "anonymous");
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const fs = ctx.firestore();
    await setDoc(doc(fs, "shops", "10007"), { address: "目黒区", published: true, ownerUid: owner.uid });
    await setDoc(doc(fs, "shops", "10007", "items", "i1"), { name: "chair", price: 100 });
    await setDoc(doc(fs, "shops", "10008"), { address: "目黒区", published: true });
    await setDoc(doc(fs, "shops", "10008", "items", "i1"), { name: "desk", price: 100 });
  });
  const cref = (db, id = undefined, shopId = "10007") =>
    doc(db, "shops", shopId, "items", "i1", "comments", id || `c${Math.random().toString(36).slice(2, 8)}`);
  const meta = (db, uid, shopId = "10007") => doc(db, "shops", shopId, "commentMeta", uid);
  const post = (u, over = {}, id = undefined, shopId = "10007") => {
    const b = writeBatch(u.db);
    b.set(meta(u.db, u.uid, shopId), { at: serverTimestamp() });
    b.set(cref(u.db, id, shopId), {
      authorUid: u.uid, name: "Taro", text: "Is it still available?", seller: false, at: serverTimestamp(), ...over,
    });
    return outcome(b.commit());
  };
  const reader = testEnv.unauthenticatedContext().firestore();

  check("anon buyer posts comment", (await post(buyer, {}, "cb1")) === "ALLOW");
  check("anyone reads comments", (await outcome(getDoc(cref(reader, "cb1")))) === "ALLOW");
  check("second comment inside cooldown denied", (await post(buyer)).startsWith("DENY"));
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(meta(ctx.firestore(), buyer.uid), { at: Timestamp.fromMillis(Date.now() - 60000) });
  });
  check("comment after cooldown allowed", (await post(buyer, {}, "cb2")) === "ALLOW");
  check("buyer cannot post as seller", (await post(buyer2, { seller: true })).startsWith("DENY"));
  check("buyer cannot spoof authorUid", (await post(buyer2, { authorUid: "someone-else" })).startsWith("DENY"));
  check("empty text denied", (await post(buyer2, { text: "" })).startsWith("DENY"));
  check("too-long text denied", (await post(buyer2, { text: "x".repeat(501) })).startsWith("DENY"));
  check("empty name denied", (await post(buyer2, { name: "" })).startsWith("DENY"));
  check("extra field denied", (await post(buyer2, { admin: true })).startsWith("DENY"));
  check("client-supplied time denied", (await post(buyer2, { at: Timestamp.fromMillis(Date.now() - 999999) })).startsWith("DENY"));
  check("comment without cooldown stamp denied", (await outcome(setDoc(cref(buyer2.db), {
    authorUid: buyer2.uid, name: "Taro", text: "hi", seller: false, at: serverTimestamp(),
  }))).startsWith("DENY"));
  check("unauthenticated cannot post", (await outcome(setDoc(cref(reader), {
    authorUid: "x", name: "Taro", text: "hi", seller: false, at: serverTimestamp(),
  }))).startsWith("DENY"));
  check("missing item denied", (await outcome(setDoc(doc(buyer2.db, "shops", "10007", "items", "nope", "comments", "z"), {
    authorUid: buyer2.uid, name: "T", text: "hi", seller: false, at: serverTimestamp(),
  }))).startsWith("DENY"));
  check("owner posts seller reply", (await post(owner, { seller: true, name: "Elton", text: "Yes!" }, "cs1")) === "ALLOW");
  check("unclaimed shop: nobody is seller", (await post(buyer2, { seller: true }, undefined, "10008")).startsWith("DENY"));
  check("comments cannot be edited", (await outcome(updateDoc(cref(buyer.db, "cb1"), { text: "edit" }))).startsWith("DENY"));
  check("other buyer cannot delete", (await outcome(deleteDoc(cref(buyer2.db, "cb1")))).startsWith("DENY"));
  check("author deletes own comment", (await outcome(deleteDoc(cref(buyer.db, "cb2")))) === "ALLOW");
  check("owner deletes spam", (await outcome(deleteDoc(cref(owner.db, "cb1")))) === "ALLOW");
  check("cooldown stamp unreadable by others", (await outcome(getDoc(meta(buyer2.db, buyer.uid)))).startsWith("DENY"));
}
{
  // Back-up waitlist: cancelling keeps waiters on the cancelled claim so the owner can promote.
  const buyer = user("buyer-w", "anonymous");
  const waiter = user("waiter-w", "anonymous");
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const fs = ctx.firestore();
    await setDoc(doc(fs, "shops", "10005"), { address: "目黒区", published: true, ownerUid: "seller-w" });
    await setDoc(doc(fs, "shops", "10005", "items", "i1"), { name: "傘", price: 100, claimId: "c1", pos: 0 });
    await setDoc(doc(fs, "shops", "10005", "claims", "c1"), {
      code: "WAIT", day: "2026-11-27", slot: "10:00", itemIds: ["i1"],
      status: "booked", buyerUid: buyer.uid, contact: "みるく", waiters: [],
    });
  });
  const cref = doc(buyer.db, "shops", "10005", "claims", "c1");
  check("any signed-in user can join back-up list", (await outcome(updateDoc(doc(waiter.db, "shops", "10005", "claims", "c1"), {
    waiters: [{ account: "はな", at: "2026-11-27T00:00:00.000Z", itemIds: ["i1"] }],
  }))) === "ALLOW");
  check("buyer cancel keeps back-ups on the claim", (await outcome(updateDoc(cref, {
    status: "cancelled",
  }))) === "ALLOW");
}

{
  // Owner reschedule to an arbitrary time (10:30, 14:45); rules never restricted slot values.
  const owner = user("owner-t", "anonymous");
  const buyer = user("buyer-t", "anonymous");
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const fs = ctx.firestore();
    await setDoc(doc(fs, "shops", "10030"), { address: "目黒区", published: true, ownerUid: owner.uid });
    await setDoc(doc(fs, "shops", "10030", "claims", "c1"), {
      code: "TIME", day: "2026-11-27", slot: "10:00", itemIds: [],
      status: "booked", buyerUid: buyer.uid, contact: "みるく", waiters: [],
    });
  });
  const oref = doc(owner.db, "shops", "10030", "claims", "c1");
  check("owner reschedules to custom time 10:30", (await outcome(updateDoc(oref, { day: "2026-11-28", slot: "10:30" }))) === "ALLOW");
  check("owner reschedules to custom time 14:45", (await outcome(updateDoc(oref, { slot: "14:45" }))) === "ALLOW");
  check("buyer can still reschedule to a custom time", (await outcome(updateDoc(doc(buyer.db, "shops", "10030", "claims", "c1"), {
    day: "2026-11-29", slot: "10:30",
  }))) === "ALLOW");
}

await testEnv.cleanup();
if (fails.length) {
  console.error(`\n${fails.length} failed`);
  process.exit(1);
}
console.log("\nall passed");
