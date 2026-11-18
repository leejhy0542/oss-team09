import assert from "node:assert/strict";
import { test } from "node:test";
import { calculateDiscardRate, calculateFridgeStats } from "../server/fridge-stats.js";

const item = (owner, status) => ({ owner, status });

test("사람별 냉장고 점유: 주인별로 등록 수와 상태별 수를 센다", () => {
  const stats = calculateFridgeStats(
    ["민지", "서준"],
    [
      item("민지", "available"),
      item("민지", "consumed"),
      item("민지", "discarded"),
      item("서준", "consumed"),
    ],
  );
  assert.deepEqual(stats, [
    { name: "민지", total: 3, available: 1, consumed: 1, discarded: 1, discardRate: 50 },
    { name: "서준", total: 1, available: 0, consumed: 1, discarded: 0, discardRate: 0 },
  ]);
});

test("사람별 냉장고 점유: 등록한 식품이 없는 멤버도 0으로 보여준다", () => {
  const stats = calculateFridgeStats(["민지", "서준"], [item("민지", "available")]);
  assert.deepEqual(stats[1], {
    name: "서준", total: 0, available: 0, consumed: 0, discarded: 0, discardRate: null,
  });
});

test("사람별 냉장고 점유: 주인이 없거나 멤버가 아니면 공용으로 모은다", () => {
  const stats = calculateFridgeStats(
    ["민지", "서준"],
    [item("", "discarded"), item(undefined, "available"), item("떠난사람", "consumed")],
  );
  const noOwner = stats.find((row) => row.name === "공용");
  assert.equal(stats.length, 3);
  assert.equal(noOwner.total, 3);
  assert.equal(noOwner.discardRate, 50);
});

test("폐기율: 보관 중은 빼고, 끝난 식품이 없으면 null", () => {
  assert.equal(calculateDiscardRate(0, 0), null);
  assert.equal(calculateDiscardRate(2, 1), 33.3);
  assert.equal(calculateDiscardRate(0, 4), 100);
});

test("사람별 냉장고 점유: 배열이 아니면 거부한다", () => {
  assert.throws(() => calculateFridgeStats(null, []), TypeError);
});
