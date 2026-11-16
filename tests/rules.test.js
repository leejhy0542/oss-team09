import assert from "node:assert/strict";
import { test } from "node:test";
import { calculateMinimumTransfers, calculateShares } from "../Calcul.js";
import {
  calculateBalances,
  getExpiryStatus,
  isFridgeItemVisible,
  isValidDate,
  todayInSeoul,
} from "../server/rules.js";

test("1인당 부담액: 나머지 원은 결제한 사람이 낸다", () => {
  assert.deepEqual(calculateShares(10000, ["민지", "서준", "하은"], "민지"), [
    { name: "민지", amount: 3334 },
    { name: "서준", amount: 3333 },
    { name: "하은", amount: 3333 },
  ]);
});

test("1인당 부담액: 0원이나 소수 금액은 거부한다", () => {
  assert.throws(() => calculateShares(0, ["a", "b"], "a"), RangeError);
  assert.throws(() => calculateShares(100.5, ["a", "b"], "a"), RangeError);
});

test("최소 송금: 한 사람이 다 냈으면 나머지가 각자 한 번씩 보낸다", () => {
  assert.deepEqual(calculateMinimumTransfers({ 민지: 6666, 서준: -3333, 하은: -3333 }), [
    { from: "서준", to: "민지", amount: 3333 },
    { from: "하은", to: "민지", amount: 3333 },
  ]);
});

test("최소 송금: 금액이 맞는 쌍은 한 번에 정리해 송금 수를 줄인다", () => {
  const transfers = calculateMinimumTransfers({ a: 5000, b: -5000, c: 3000, d: -3000 });
  assert.equal(transfers.length, 2);
});

test("잔액 계산: 여러 지출을 누적하고 합계는 0이다", () => {
  const balances = calculateBalances({
    members: ["a", "b"],
    expenses: [
      { id: "1", amount: 10000, payer: "a", participants: ["a", "b"] },
      { id: "2", amount: 4000, payer: "b", participants: ["a", "b"] },
    ],
  });
  assert.deepEqual(balances, { a: 3000, b: -3000 });
});

test("잔액 계산: 완료한 송금은 잔액에서 빠진다", () => {
  const balances = calculateBalances({
    members: ["a", "b"],
    expenses: [{ id: "1", amount: 10000, payer: "a", participants: ["a", "b"] }],
    completedTransfers: [{ from: "b", to: "a", amount: 5000 }],
  });
  assert.deepEqual(balances, { a: 0, b: 0 });
});

test("유통기한 판정: 지남, 임박(0~2일), 여유, 미입력", () => {
  const today = "2026-11-16";
  assert.equal(getExpiryStatus("2026-11-15", today).status, "expired");
  assert.equal(getExpiryStatus("2026-11-16", today).status, "soon");
  assert.equal(getExpiryStatus("2026-11-18", today).status, "soon");
  assert.equal(getExpiryStatus("2026-11-19", today).status, "fresh");
  assert.equal(getExpiryStatus("", today).status, "unknown");
});

test("날짜 검사: 없는 날짜는 거부한다", () => {
  assert.equal(isValidDate("2026-02-29"), false);
  assert.equal(isValidDate("2028-02-29"), true);
  assert.equal(isValidDate("2026/11/16"), false);
});

test("오늘 날짜는 한국 시간 기준이다", () => {
  // UTC 11월 15일 16시 = 한국 11월 16일 새벽 1시
  assert.equal(todayInSeoul(new Date("2026-11-15T16:00:00Z")), "2026-11-16");
});

test("다 먹음·폐기 식품은 바꾼 지 7일이 지나면 목록에서 빠진다", () => {
  const now = new Date("2026-11-16T00:00:00Z");
  const item = (status, statusChangedAt) => ({ status, statusChangedAt });
  assert.equal(isFridgeItemVisible(item("available"), now), true);
  assert.equal(isFridgeItemVisible(item("consumed", "2026-11-10T00:00:00Z"), now), true);
  assert.equal(isFridgeItemVisible(item("discarded", "2026-11-09T00:00:00Z"), now), false);
});
