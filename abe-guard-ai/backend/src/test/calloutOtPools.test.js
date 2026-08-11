/**
 * OT pool split unit tests (pure helpers).
 * Run: node --test src/test/calloutOtPools.test.js
 */
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  calculateShiftHours,
  rangesOverlap,
  timeToMinutes,
  splitIntoOtPools,
  selectNotifyPools,
} = require("../services/calloutOtPools.service");

describe("calloutOtPools", () => {
  it("calculateShiftHours handles overnight", () => {
    assert.equal(
      calculateShiftHours({ shift_start: "22:00:00", shift_end: "06:00:00" }),
      8
    );
    assert.equal(
      calculateShiftHours({ shift_start: "08:00:00", shift_end: "16:00:00" }),
      8
    );
  });

  it("rangesOverlap detects conflicts", () => {
    const a0 = timeToMinutes("08:00:00");
    const a1 = timeToMinutes("16:00:00");
    const b0 = timeToMinutes("12:00:00");
    const b1 = timeToMinutes("20:00:00");
    assert.equal(rangesOverlap(a0, a1, b0, b1), true);
    assert.equal(
      rangesOverlap(
        timeToMinutes("08:00:00"),
        timeToMinutes("12:00:00"),
        timeToMinutes("12:00:00"),
        timeToMinutes("16:00:00")
      ),
      false
    );
  });

  it("splits into straight-time vs OT and excludes conflicts/unavailable", () => {
    const shift = { shift_start: "08:00:00", shift_end: "16:00:00" }; // 8h
    const guards = [
      { id: "a", name: "A", weekly_hours: 20 }, // 28 projected → A
      { id: "b", name: "B", weekly_hours: 36 }, // 44 projected → B
      { id: "c", name: "C", weekly_hours: 10 }, // conflict
      { id: "d", name: "D", weekly_hours: 5 }, // unavailable
    ];
    const split = splitIntoOtPools(guards, shift, {
      weeklyCap: 40,
      conflictIds: new Set(["c"]),
      unavailableIds: new Set(["d"]),
    });
    assert.equal(split.poolA.map((g) => g.id).join(","), "a");
    assert.equal(split.poolB.map((g) => g.id).join(","), "b");
    assert.equal(split.excluded.length, 2);
    assert.equal(split.excluded.find((g) => g.id === "c")._poolReason, "time_conflict");
    assert.equal(split.excluded.find((g) => g.id === "d")._poolReason, "unavailable");
  });

  it("notify policy prefers straight-time; OT only when empty", () => {
    const a = [{ id: "a" }];
    const b = [{ id: "b" }];
    const onlyA = selectNotifyPools(a, b, {});
    assert.deepEqual(
      onlyA.notify.map((g) => g.id),
      ["a"]
    );
    assert.equal(onlyA.otNecessary, false);
    assert.equal(onlyA.policy, "straight_time_only");

    const otNeeded = selectNotifyPools([], b, {});
    assert.deepEqual(
      otNeeded.notify.map((g) => g.id),
      ["b"]
    );
    assert.equal(otNeeded.otNecessary, true);
    assert.equal(otNeeded.policy, "ot_necessary_no_straight_time");

    const both = selectNotifyPools(a, b, { alwaysIncludeOt: true });
    assert.deepEqual(
      both.notify.map((g) => g.id),
      ["a", "b"]
    );
  });
});
