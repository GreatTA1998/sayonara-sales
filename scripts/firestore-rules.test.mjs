/**
 * Unclaimed shops are editable/publishable by any signed-in or anonymous user.
 * Claimed shops are owner-only. Claim still works after those edits.
 * Run: npm run test:rules
 */
import { readFileSync } from "fs";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, runTransaction } from "firebase/firestore";

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

await testEnv.cleanup();
if (fails.length) {
  console.error(`\n${fails.length} failed`);
  process.exit(1);
}
console.log("\nall passed");
