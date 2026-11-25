/**
 * Firestore rules for unclaimed-shop prep vs claim.
 * Run: npx firebase-tools emulators:exec --only firestore --project demo-sayonara -- "node scripts/firestore-rules.test.mjs"
 */
import { readFileSync } from "fs";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, deleteDoc, runTransaction } from "firebase/firestore";

const hostEnv = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";
const [host, portStr] = hostEnv.split(":");
const rules = readFileSync(new URL("../firestore.rules", import.meta.url), "utf8");

const testEnv = await initializeTestEnvironment({
  projectId: "demo-sayonara",
  firestore: { rules, host, port: Number(portStr) },
});

let n = 0;
const anon = (name) => {
  n += 1;
  const uid = `${name}-${n}`;
  const db = testEnv.authenticatedContext(uid, {
    firebase: { sign_in_provider: "anonymous" },
  }).firestore();
  return { uid, db };
};

const seed = async (id, data) => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "shops", id), data);
  });
};

const outcome = async (p) => {
  try { await p; return "ALLOW"; }
  catch (e) { return `DENY ${e.code || ""}`.trim(); }
};

const shop = (db, id) => doc(db, "shops", id);
const fails = [];
const check = (name, cond) => {
  const ok = cond === true || cond === "ALLOW" || (typeof cond === "string" && cond.startsWith("ALLOW"));
  console.log(`${ok ? "ok" : "FAIL"} ${name}${typeof cond === "string" ? `: ${cond}` : ""}`);
  if (!ok) fails.push(name);
};

const base = (uid) => ({
  address: "", bio: "", jimotyUrl: "", youtubeUrl: "", facebookUrl: "",
  lineInviteUrl: "", phone: "", slots: [], pickupSpots: [], pickupFrom: "",
  pickupTo: "", moveOut: "", leadDays: 2, minItems: 2, minTotal: 0,
  published: false, creatorUid: uid, updatedAt: "t0",
});

await testEnv.clearFirestore();

{
  const { uid, db } = anon("prep");
  check("create as creator", await outcome(setDoc(shop(db, "10001"), base(uid))));
  check("creator adds item", await outcome(setDoc(doc(db, "shops", "10001", "items", "i1"), {
    name: "chair", price: 100, photos: [], pos: 0,
  })));
  check("creator edits ward", await outcome(updateDoc(shop(db, "10001"), { address: "目黒区", updatedAt: "t1" })));
  const after = await getDoc(shop(db, "10001"));
  check("edit did not claim", !after.data().ownerUid && after.data().published === false && after.data().address === "目黒区");
  check("creator appends photo", await outcome(updateDoc(doc(db, "shops", "10001", "items", "i1"), {
    photos: ["https://blob.example/a.webp"],
  })));
  check("creator deletes item", await outcome(deleteDoc(doc(db, "shops", "10001", "items", "i1"))));
  check("creator cannot publish", (await outcome(updateDoc(shop(db, "10001"), { published: true }))).startsWith("DENY"));
  check("creator cannot set ownerUid", (await outcome(updateDoc(shop(db, "10001"), { ownerUid: uid }))).startsWith("DENY"));
  const still = await getDoc(shop(db, "10001"));
  check("still unclaimed after rejected writes", !still.data().ownerUid && still.data().published === false);
}

{
  const prep = anon("prep");
  await outcome(setDoc(shop(prep.db, "10002"), base(prep.uid)));
  const stranger = anon("other");
  check("stranger cannot edit", (await outcome(updateDoc(shop(stranger.db, "10002"), { address: "渋谷区" }))).startsWith("DENY"));
  check("stranger cannot add item", (await outcome(setDoc(doc(stranger.db, "shops", "10002", "items", "i9"), { name: "x" }))).startsWith("DENY"));
  const ref = shop(stranger.db, "10002");
  const uref = doc(stranger.db, "uids", stranger.uid);
  check("seller claims", await outcome(runTransaction(stranger.db, async (tx) => {
    const [, usnap] = await Promise.all([tx.get(ref), tx.get(uref)]);
    if (!usnap.exists()) tx.set(uref, { shopId: "10002" });
    tx.update(ref, { ownerUid: stranger.uid, updatedAt: "t2", ownerFacebookName: "Seller" });
  })));
  const claimed = await getDoc(ref);
  check("seller owns, creator kept", claimed.data().ownerUid === stranger.uid && claimed.data().creatorUid === prep.uid);
  check("creator locked out after claim", (await outcome(updateDoc(shop(prep.db, "10002"), { address: "hack" }))).startsWith("DENY"));
  check("owner edits item", await outcome(setDoc(doc(stranger.db, "shops", "10002", "items", "i2"), { name: "lamp" })));
  check("owner publishes", await outcome(updateDoc(ref, { published: true, updatedAt: "t3" })));
}

{
  const a = anon("x");
  check("create with ownerUid denied", (await outcome(setDoc(shop(a.db, "10003"), {
    ...base(a.uid), ownerUid: a.uid,
  }))).startsWith("DENY"));
  check("create published denied", (await outcome(setDoc(shop(a.db, "10004"), {
    ...base(a.uid), published: true,
  }))).startsWith("DENY"));
}

{
  await seed("36452", { address: "", published: false, updatedAt: "t0" });
  const first = anon("legacy");
  check("legacy first editor stamps creator", await outcome(updateDoc(shop(first.db, "36452"), {
    creatorUid: first.uid, address: "世田谷区",
  })));
  const other = anon("legacy2");
  check("legacy second editor denied", (await outcome(updateDoc(shop(other.db, "36452"), { address: "港区" }))).startsWith("DENY"));
  const again = await getDoc(shop(first.db, "36452"));
  check("legacy editor did not claim", !again.data().ownerUid && again.data().creatorUid === first.uid);
}

{
  const { db } = anon("elton");
  await seed("elton", { address: "目黒区", published: true, ownerUid: "someone" });
  check("elton still editable", await outcome(updateDoc(shop(db, "elton"), { address: "目黒区2" })));
}

await testEnv.cleanup();
if (fails.length) {
  console.error(`\n${fails.length} failed`);
  process.exit(1);
}
console.log("\nall passed");
