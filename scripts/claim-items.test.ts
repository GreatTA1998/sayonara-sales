import assert from "node:assert/strict";
import { claimAddBlock, claimAddHard, holderStatus, searchItems } from "../lib/store";

const claim = { id: "c1", day: "2026-12-01", itemIds: ["a"] };
assert.equal(claimAddBlock({ id: "a" }, claim, ""), "追加済み");
assert.equal(claimAddBlock({ id: "b", paused: true }, claim, ""), "一時停止中");
assert.equal(claimAddBlock({ id: "b", claimId: "c2" }, claim, "booked"), "取引中");
assert.equal(claimAddBlock({ id: "b", claimId: "c2" }, claim, "requested"), "取引中");
assert.equal(claimAddBlock({ id: "b", claimId: "c2" }, claim, "picked_up"), "取引中");
// stale pointer to cancelled / missing claim does not hold the item
assert.equal(claimAddBlock({ id: "b", claimId: "c2" }, claim, "cancelled"), null);
assert.equal(claimAddBlock({ id: "b", claimId: "c2" }, claim, ""), null);
assert.equal(claimAddBlock({ id: "b", claimId: null }, claim, ""), null);
assert.ok(claimAddBlock({ id: "b", availableAfter: "2026-12-10" }, claim, "")?.endsWith("以降"));
assert.equal(claimAddBlock({ id: "b", availableAfter: "2026-12-01" }, claim, ""), null);

assert.equal(holderStatus({ claims: [{ id: "c2", status: "booked" } as never] }, { claimId: "c2" }), "booked");
assert.equal(holderStatus({ claims: [] }, { claimId: "c2" }), "");

const items = [{ name: "ダイニングチェア" }, { name: "本棚 木製", note: "Ikea" }, { name: "ＴＶ台" }];
assert.equal(searchItems(items, "").length, 0);
assert.deepEqual(searchItems(items, "本棚").map((i) => i.name), ["本棚 木製"]);
assert.deepEqual(searchItems(items, "ikea 木製").map((i) => i.name), ["本棚 木製"]);
assert.deepEqual(searchItems(items, "tv").map((i) => i.name), ["ＴＶ台"]);
// Owner override: 取引中 / paused / early stay soft blocks; only this-request and sold items are hard.
assert.equal(claimAddHard({ id: "a" }, claim, ""), "追加済み");
assert.equal(claimAddHard({ id: "b", claimId: "c2" }, claim, "picked_up"), "受付終了");
assert.equal(claimAddHard({ id: "b", claimId: "c2" }, claim, "booked"), null);
assert.equal(claimAddHard({ id: "b", claimId: "c2" }, claim, "requested"), null);
assert.equal(claimAddHard({ id: "b" }, claim, ""), null);
assert.equal(claimAddHard({ id: "b", claimId: "c1" }, { id: "c1", itemIds: [] }, "picked_up"), null);
console.log("claim-items ok");
