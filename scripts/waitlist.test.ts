import assert from "node:assert/strict";
import { planPromotion, waiterCovers, waitersFor, type Waiter } from "../lib/waitlist";

const w = (account: string, itemIds?: string[]): Waiter => ({ account, at: "2026-11-28T00:00:00.000Z", ...(itemIds ? { itemIds } : {}) });
const claim = { itemIds: ["sofa", "fridge", "bed"] };

// Legacy rows (no itemIds) cover every item on the claim.
assert.ok(waiterCovers(w("a"), "sofa"));
assert.ok(!waiterCovers(w("a", ["fridge"]), "sofa"));
assert.deepEqual(waitersFor([w("a", ["sofa"]), w("b"), w("c", ["bed"])], "sofa").map((x) => x.account), ["a", "b"]);

// First in line wins, only on the items they queued for.
{
  const p = planPromotion({ ...claim, waiters: [w("a", ["sofa"]), w("b", ["sofa", "fridge"]), w("c", ["bed"])] }, ["sofa", "fridge", "bed"])!;
  assert.equal(p.winner.account, "a");
  assert.deepEqual(p.itemIds, ["sofa"]);
  assert.deepEqual(p.moved.map((x) => [x.account, x.itemIds]), [["b", ["sofa"]]]);
  assert.deepEqual(p.left.map((x) => x.account), ["c"]);
}

// Skips someone whose items are no longer free; order of the rest is kept.
{
  const p = planPromotion({ ...claim, waiters: [w("a", ["sofa"]), w("b", ["fridge"]), w("c", ["fridge", "bed"])] }, ["fridge", "bed"])!;
  assert.equal(p.winner.account, "b");
  assert.deepEqual(p.itemIds, ["fridge"]);
  assert.deepEqual(p.moved.map((x) => x.account), ["c"]);
  assert.deepEqual(p.left.map((x) => x.account), ["a"]);
}

// A legacy row takes every free item, and ids off the claim are ignored.
{
  const p = planPromotion({ ...claim, waiters: [w("a")] }, ["sofa", "bed", "ghost"])!;
  assert.deepEqual(p.itemIds, ["sofa", "bed"]);
}

assert.equal(planPromotion({ ...claim, waiters: [] }, ["sofa"]), null);
assert.equal(planPromotion({ ...claim, waiters: [w("a", ["sofa"])] }, []), null);
console.log("waitlist ok");
