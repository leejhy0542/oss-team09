import assert from "node:assert/strict";
import { test } from "node:test";
import {
  calculateMonthlyCategoryTotals,
  calculateMinimumTransfers,
  calculateShares,
  getExpiryInfo,
} from "../Calcul.js";
import {
  calculateBalances,
  getExpiryStatus,
  isFridgeItemVisible,
  isValidDate,
  todayInSeoul,
} from "../server/rules.js";

test("월별 카테고리 합계: 한국 시간 기준으로 월을 나누고 잘못된 카테고리는 기타에 합산한다", () => {
  const totals = calculateMonthlyCategoryTotals([
    { createdAt: "2026-01-31T15:00:00Z", category: "장보기", amount: 1250 },
    { createdAt: "2026-01-31T14:00:00Z", category: "월세", amount: 3000 },
    { createdAt: "2026-02-10T00:00:00Z", category: "미분류", amount: 75 },
    { createdAt: "2026-02-11T00:00:00Z", category: "교통", amount: 500 },
    { createdAt: "잘못된 날짜", category: "기타", amount: 999 },
  ], ["공과금", "월세", "장보기", "기타", "교통"]);

  assert.deepEqual(totals, [
    {
      month: "2026-02",
      categories: [
        { category: "공과금", amount: 0n },
        { category: "월세", amount: 0n },
        { category: "장보기", amount: 1250n },
        { category: "기타", amount: 75n },
        { category: "교통", amount: 500n },
      ],
    },
    {
      month: "2026-01",
      categories: [
        { category: "공과금", amount: 0n },
        { category: "월세", amount: 3000n },
        { category: "장보기", amount: 0n },
        { category: "기타", amount: 0n },
        { category: "교통", amount: 0n },
      ],
    },
  ]);
});

test("월별 카테고리 합계: 내역이 없으면 빈 목록을 반환한다", () => {
  assert.deepEqual(calculateMonthlyCategoryTotals([]), []);
});

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

test("유통기한 표시: 폐기 확인, 임박, 여유, 미입력을 구분한다", () => {
  const dateAfter = (days) => {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0"),
    ].join("-");
  };

  assert.equal(getExpiryInfo(dateAfter(-1)).label, "폐기 확인");
  assert.equal(getExpiryInfo(dateAfter(0)).label, "오늘까지");
  assert.equal(getExpiryInfo(dateAfter(2)).className, "expiry-soon");
  assert.equal(getExpiryInfo(dateAfter(3)).label, "여유");
  assert.equal(getExpiryInfo("").className, "expiry-unknown");
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
