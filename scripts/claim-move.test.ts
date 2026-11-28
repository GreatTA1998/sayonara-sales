/**
 * Owner reassigns a 取引中 item from another open request (addClaimItems force path).
 * Run via npm run test:claim-move (firestore emulator).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";

process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = "demo-sayonara";
process.env.NEXT_PUBLIC_FIREBASE_API_KEY = "demo";
process.env.NEXT_PUBLIC_FIREBASE_APP_ID = "1:1:web:demo";

async function main() {
const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080").split(":");
const env = await initializeTestEnvironment({
  projectId: "demo-sayonara",
  firestore: { host, port: +port, rules: readFileSync(new URL("../firestore.rules", import.meta.url), "utf8") },
});
const { addClaimItems } = await import("../lib/live");
const owner = env.authenticatedContext("owner-1", { firebase: { sign_in_provider: "anonymous" } }).firestore();
const S = "elton"; // any signed-in user administers elton
const ref = (...p: string[]) => doc(owner, "shops", S, ...p);
const seed = async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const fs = ctx.firestore();
    await setDoc(doc(fs, "shops", S), { address: "目黒区", published: true });
    await setDoc(doc(fs, "shops", S, "items", "blanket"), { name: "毛布", price: 1000, claimId: "other" });
    await setDoc(doc(fs, "shops", S, "items", "lamp"), { name: "ランプ", price: 500, claimId: "other" });
    await setDoc(doc(fs, "shops", S, "items", "sold"), { name: "売約済み", price: 300, claimId: "done" });
    await setDoc(doc(fs, "shops", S, "items", "paused"), { name: "停止中", price: 300, paused: true });
    await setDoc(doc(fs, "shops", S, "items", "solo"), { name: "単品", price: 100, claimId: "single" });
    await setDoc(doc(fs, "shops", S, "claims", "mine"), { code: "MINE", day: "2026-12-01", slot: "10:00", itemIds: [], status: "requested", contact: "me", buyerUid: "b1" });
    await setDoc(doc(fs, "shops", S, "claims", "other"), { code: "OTHR", day: "2026-12-02", slot: "14:00", itemIds: ["blanket", "lamp"], status: "booked", contact: "taro", buyerUid: "b2" });
    await setDoc(doc(fs, "shops", S, "claims", "done"), { code: "DONE", day: "2026-11-20", slot: "10:00", itemIds: ["sold"], status: "picked_up", contact: "old", buyerUid: "b3" });
    await setDoc(doc(fs, "shops", S, "claims", "single"), { code: "ONE", day: "2026-12-03", slot: "10:00", itemIds: ["solo"], status: "booked", contact: "hana", buyerUid: "b4" });
  });
};
const rejects = async (p: Promise<unknown>, re: RegExp) => assert.rejects(p, re);

await env.clearFirestore(); await seed();
// without force, a held item still aborts
await rejects(addClaimItems(S, "mine", ["blanket"], {}, owner as never), /取引中/);
// sold items never move, even with force
await rejects(addClaimItems(S, "mine", ["sold"], { force: true, cancelEmpty: true }, owner as never), /受付終了/);
// force moves a held item; the other request keeps its remaining item
await addClaimItems(S, "mine", ["blanket"], { force: true }, owner as never);
assert.deepEqual((await getDoc(ref("claims", "mine"))).data()!.itemIds, ["blanket"]);
assert.deepEqual((await getDoc(ref("claims", "other"))).data()!.itemIds, ["lamp"]);
assert.equal((await getDoc(ref("claims", "other"))).data()!.status, "booked");
assert.equal((await getDoc(ref("items", "blanket"))).data()!.claimId, "mine");
// moving the last item needs cancelEmpty, then cancels that request
await rejects(addClaimItems(S, "mine", ["solo"], { force: true }, owner as never), /確認/);
assert.deepEqual((await getDoc(ref("claims", "single"))).data()!.itemIds, ["solo"]);
await addClaimItems(S, "mine", ["solo"], { force: true, cancelEmpty: true }, owner as never);
assert.equal((await getDoc(ref("claims", "single"))).data()!.status, "cancelled");
assert.deepEqual((await getDoc(ref("claims", "single"))).data()!.itemIds, []);
assert.equal((await getDoc(ref("items", "solo"))).data()!.claimId, "mine");
// paused item: blocked without force, allowed with
await rejects(addClaimItems(S, "mine", ["paused"], {}, owner as never), /一時停止中/);
await addClaimItems(S, "mine", ["paused"], { force: true }, owner as never);
assert.ok((await getDoc(ref("claims", "mine"))).data()!.itemIds.includes("paused"));

await env.cleanup();
console.log("claim-move ok");
}
main().catch((e) => { console.error(e); process.exit(1); });
