import test from "node:test";
import assert from "node:assert/strict";
import { selectExpiringIngredients } from "../server/menu/menu-rules.js";

const TODAY = "2026-11-16";

function makeItem(expirationDate, status = "available") {
  return { name: "두부", expirationDate, status };
}

test("오늘부터 2일 뒤까지의 식품만 포함", () => {
  const items = [
    makeItem("2026-11-16"),
    makeItem("2026-11-17"),
    makeItem("2026-11-18"),
    makeItem("2026-11-19"),
  ];

  assert.deepEqual(selectExpiringIngredients(items, TODAY), items.slice(0, 3));
});

test("기한이 지난 식품은 제외", () => {
  assert.deepEqual(selectExpiringIngredients([makeItem("2026-11-15")], TODAY), []);
});

test("다 먹음과 폐기 상태는 제외", () => {
  const items = [makeItem(TODAY, "consumed"), makeItem(TODAY, "discarded")];
  assert.deepEqual(selectExpiringIngredients(items, TODAY), []);
});

test("기한 미입력 식품은 제외", () => {
  assert.deepEqual(selectExpiringIngredients([makeItem("")], TODAY), []);
});

test("빈 목록이면 빈 배열을 반환", () => {
  assert.deepEqual(selectExpiringIngredients([], TODAY), []);
});

test("월말과 연말을 넘어도 날짜 차이를 계산", () => {
  const monthEnd = makeItem("2026-12-01");
  const yearEnd = makeItem("2027-01-01");
  assert.deepEqual(selectExpiringIngredients([monthEnd], "2026-11-30"), [monthEnd]);
  assert.deepEqual(selectExpiringIngredients([yearEnd], "2026-12-31"), [yearEnd]);
});

test("윤년의 2월 29일도 처리", () => {
  const item = makeItem("2028-02-29");
  assert.deepEqual(selectExpiringIngredients([item], "2028-02-28"), [item]);
});

test("기준 일수를 0으로 지정하면 오늘까지인 식품만 선택", () => {
  const items = [makeItem(TODAY), makeItem("2026-11-17")];
  assert.deepEqual(selectExpiringIngredients(items, TODAY, 0), [items[0]]);
});

test("존재하지 않는 날짜와 잘못된 날짜 형식은 거부", () => {
  assert.throws(() => selectExpiringIngredients([makeItem("2026-02-30")], TODAY), RangeError);
  assert.throws(() => selectExpiringIngredients([], "2026-02-29"), RangeError);
  assert.throws(() => selectExpiringIngredients([], "2026/11/16"), TypeError);
});

test("잘못된 목록, 식품, 기준 일수는 거부", () => {
  assert.throws(() => selectExpiringIngredients(null, TODAY), TypeError);
  assert.throws(() => selectExpiringIngredients([null], TODAY), TypeError);
  assert.throws(() => selectExpiringIngredients([makeItem(TODAY, "unknown")], TODAY), TypeError);
  assert.throws(() => selectExpiringIngredients([], TODAY, -1), RangeError);
  assert.throws(() => selectExpiringIngredients([], TODAY, 1.5), RangeError);
});

test("원본 배열과 식품 객체를 수정하지 않음", () => {
  const items = [makeItem(TODAY), makeItem("2026-11-19")];
  const original = structuredClone(items);
  const result = selectExpiringIngredients(items, TODAY);

  assert.deepEqual(items, original);
  assert.notStrictEqual(result, items);
});
