import assert from "node:assert/strict";
import { test } from "node:test";
import { linePushText } from "../lib/line";
import { byClaimWhen, slotTaken, slotTime, slotsOverlap } from "../lib/store";

test("custom times normalise and sort with the fixed slots", () => {
  assert.equal(slotTime("10:30"), "10:30");
  assert.equal(slotTime("9:05"), "09:05");
  assert.equal(slotTime("10:00–10:15"), "10:00");
  const rows = [{ day: "2026-12-01", slot: "14:45" }, { day: "2026-12-01", slot: "10:30" }, { day: "2026-12-01", slot: "10:00" }, { day: "2026-11-30", slot: "20:00" }];
  assert.deepEqual(rows.sort(byClaimWhen).map((r) => `${r.day} ${r.slot}`),
    ["2026-11-30 20:00", "2026-12-01 10:00", "2026-12-01 10:30", "2026-12-01 14:45"]);
});

test("overlap uses the 15-minute slot window", () => {
  assert.equal(slotsOverlap("10:00", "10:14"), true);
  assert.equal(slotsOverlap("10:00", "10:15"), false);
  assert.equal(slotsOverlap("10:30", "10:00–10:15"), false);
  assert.equal(slotsOverlap("14:45", "14:40"), true);
  assert.equal(slotsOverlap("", "10:00"), false);
  assert.equal(slotTaken(["10:30"], "10:00"), false);
  assert.equal(slotTaken(["10:10"], "10:00"), true);
  assert.equal(slotTaken(["14:00"], "14:00"), true);
});

test("LINE push shows a single HH:mm for custom and legacy slots", () => {
  assert.match(linePushText("reschedule", { day: "12/1", slot: "10:30" }), /12\/1 10:30/);
  assert.match(linePushText("confirm", { day: "12/1", slot: "10:00–10:15", code: "ABCD" }), /12\/1 10:00\n/);
  assert.match(linePushText("confirm", { day: "12/1", slot: "9:05", code: "ABCD" }), /12\/1 09:05/);
});
