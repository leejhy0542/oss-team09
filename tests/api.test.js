import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createApp } from "../server/app.js";
import { createStore } from "../server/store.js";

let server;
let base;
const fakeLlm = { enabled: true, suggestMenu: async (items) => `${items.join("+")} 볶음밥` };

before(async () => {
  const store = await createStore(); // 메모리 저장소
  const app = createApp({ store, llm: fakeLlm, now: () => new Date("2026-11-16T03:00:00Z") });
  server = app.listen(0);
  base = `http://localhost:${server.address().port}/api`;
});
after(() => server.close());

async function call(method, path, body) {
  const res = await fetch(base + path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: res.status === 204 ? null : await res.json() };
}

test("정산 지출과 냉장고 식품은 각각 별도로 등록된다", async () => {
  assert.equal((await call("PUT", "/members", { members: ["민지", "서준", "하은"] })).status, 200);
  const categories = await call("POST", "/categories", { category: "교통" });
  assert.equal(categories.status, 201);
  assert.ok(categories.body.includes("교통"));
  assert.equal((await call("POST", "/categories", { category: "교통" })).status, 409);

  await call("POST", "/shopping-list", { name: "우유" });
  const created = await call("POST", "/expenses", {
    title: "공동 생활용품",
    amount: 10000,
    category: "교통",
    payer: "민지",
    participants: ["민지", "서준", "하은"],
    groceryItems: [{ name: "우유", expirationDate: "2026-11-17" }],
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.category, "교통");
  assert.deepEqual(created.body.groceryItems, []);

  const settlement = (await call("GET", "/settlement")).body;
  assert.deepEqual(settlement.balances, { 민지: 6666, 서준: -3333, 하은: -3333 });
  assert.equal(settlement.transfers.length, 2);
  assert.deepEqual((await call("GET", "/fridge")).body, []);

  const groceries = await call("POST", "/fridge", {
    items: [
      { name: "우유", expirationDate: "2026-11-17" },
      { name: "계란", expirationDate: "2026-11-30", storageType: "refrigerated" },
    ],
  });
  assert.equal(groceries.status, 201);
  const fridge = (await call("GET", "/fridge")).body;
  assert.equal(fridge.length, 2);
  assert.equal(fridge[0].name, "우유"); // 임박한 것이 먼저
  assert.equal(fridge[0].expiry.status, "soon");
  assert.equal((await call("GET", "/expenses")).body.length, 1);

  // 산 우유는 다음 장보기 목록에서 빠진다
  assert.deepEqual((await call("GET", "/shopping-list")).body, []);

  const legacyExpense = await call("POST", "/expenses", {
    title: "기존 요청 호환 확인",
    amount: 100,
    payer: "민지",
    participants: ["민지"],
  });
  assert.equal(legacyExpense.body.category, "기타");
});

test("송금 완료는 현재 정산 결과에 있는 것만 받는다", async () => {
  assert.equal((await call("POST", "/transfers", { from: "서준", to: "민지", amount: 9999 })).status, 409);
  const ok = await call("POST", "/transfers", { from: "서준", to: "민지", amount: 3333 });
  assert.equal(ok.status, 201);
  assert.equal(ok.body.settlement.transfers.length, 1);
});

test("잘못된 입력은 400과 에러 메시지를 돌려준다", async () => {
  const res = await call("POST", "/expenses", {
    title: "x", amount: -1, payer: "민지", participants: ["민지"],
  });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /1원 이상/);
  assert.equal((await call("POST", "/expenses", { title: "x", amount: 100, payer: "없는사람", participants: ["민지"] })).status, 400);
  assert.equal((await call("POST", "/expenses", {
    title: "잘못된 카테고리",
    amount: 100,
    category: "여행",
    payer: "민지",
    participants: ["민지"],
  })).status, 400);
});

test("지출이 있으면 멤버를 바꿀 수 없다", async () => {
  assert.equal((await call("PUT", "/members", { members: ["a", "b"] })).status, 409);
});

test("냉장고 상태 변경과 메뉴 제안", async () => {
  const suggestion = (await call("POST", "/fridge/menu-suggestion")).body;
  assert.deepEqual(suggestion.items, ["우유"]);
  assert.equal(suggestion.suggestion, "우유 볶음밥");

  const milk = (await call("GET", "/fridge")).body.find((i) => i.name === "우유");
  const consumed = (await call("PATCH", `/fridge/${milk.id}`, { status: "consumed" })).body;
  assert.equal(consumed.status, "consumed");
  assert.equal(consumed.statusChangedAt, "2026-11-16T03:00:00.000Z");
  // 취소하면 보관 중으로 돌아가고 바꾼 시각은 지워진다
  const restored = (await call("PATCH", `/fridge/${milk.id}`, { status: "available" })).body;
  assert.equal(restored.status, "available");
  assert.equal(restored.statusChangedAt, undefined);
  assert.equal((await call("PATCH", `/fridge/${milk.id}`, { status: "eaten" })).status, 400);
});

test("LLM이 실패해도 메뉴 제안 API는 200으로 null을 준다", async () => {
  const store = await createStore();
  await store.update((s) => ({
    ...s,
    fridgeItems: [{ id: "x", name: "두부", expirationDate: "2026-11-16", status: "available" }],
  }));
  const app = createApp({
    store,
    llm: { enabled: true, suggestMenu: async () => null },
    now: () => new Date("2026-11-16T03:00:00Z"),
  });
  const s = app.listen(0);
  const res = await fetch(`http://localhost:${s.address().port}/api/fridge/menu-suggestion`, { method: "POST" });
  const body = await res.json();
  s.close();
  assert.equal(res.status, 200);
  assert.equal(body.suggestion, null);
  assert.equal(body.reason, "llm-failed");
});

test("서버 내부 파일은 공개되지 않는다", async () => {
  const root = base.replace("/api", "");
  assert.equal((await fetch(`${root}/server/app.js`)).status, 404);
  assert.equal((await fetch(`${root}/package.json`)).status, 404);
  assert.equal((await fetch(`${root}/index.html`)).status, 200);
});

test("지출 없이 식품만 등록해도 냉장고에 들어가고 장보기 목록에서 빠진다", async () => {
  await call("POST", "/shopping-list", { name: "두부" });
  await call("POST", "/shopping-list", { name: "휴지" });
  const res = await call("POST", "/fridge", {
    items: [
      { name: "두부", expirationDate: "2026-11-18" },
      { name: "김치", storageType: "refrigerated" },
    ],
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.length, 2);
  assert.equal(res.body[0].expenseId, "");

  const names = (await call("GET", "/fridge")).body.map((i) => i.name);
  assert.ok(names.includes("두부") && names.includes("김치"));
  assert.deepEqual((await call("GET", "/shopping-list")).body.map((i) => i.name), ["휴지"]);
  assert.equal((await call("POST", "/fridge", { items: [] })).status, 400);
});
