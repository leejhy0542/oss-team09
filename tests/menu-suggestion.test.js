import test from "node:test";
import assert from "node:assert/strict";
import { bindMenuSuggestion } from "../menu-suggestion.js";

// DOM에서 사용하는 속성과 이벤트 기능만 가진 가짜 요소
class FakeElement extends EventTarget {
  textContent = "";
  disabled = false;
  attributes = new Map();

  setAttribute(name, value) {
    this.attributes.set(name, value);
  }
}

function setup(getMenuSuggestion) {
  const button = new FakeElement();
  button.textContent = "메뉴 추천받기";
  const result = new FakeElement();
  const requestMenu = bindMenuSuggestion({ button, result, getMenuSuggestion });
  return { button, result, requestMenu };
}

test("추천 문장을 표시하고 버튼과 로딩 상태를 복원", async () => {
  const { button, result, requestMenu } = setup(async () => ({
    reason: "ok", suggestion: " 두부구이를 만들어 보세요. ",
  }));
  await requestMenu();
  assert.equal(result.textContent, "두부구이를 만들어 보세요.");
  assert.equal(button.disabled, false);
  assert.equal(button.textContent, "메뉴 추천받기");
  assert.equal(result.attributes.get("aria-live"), "polite");
  assert.equal(result.attributes.get("aria-busy"), "false");
});

test("버튼 클릭으로 요청하고 요청 중 중복 호출을 막기", async () => {
  let calls = 0;
  let finish;
  const response = new Promise((resolve) => { finish = resolve; });
  const { button, result, requestMenu } = setup(() => { calls += 1; return response; });

  const click = new Event("click", { cancelable: true });
  button.dispatchEvent(click);
  button.dispatchEvent(new Event("click"));
  await requestMenu();
  assert.equal(click.defaultPrevented, true);
  assert.equal(calls, 1);
  assert.equal(button.disabled, true);
  assert.equal(button.textContent, "추천 중…");
  assert.equal(result.attributes.get("aria-busy"), "true");

  finish({ reason: "ok", suggestion: "추천 완료" });
  await response;
  assert.equal(result.textContent, "추천 완료");
  assert.equal(button.disabled, false);
});

for (const [reason, message] of [
  ["no-items", "보관 중인 식품 중 오늘부터 2일 이내에 기한이 도래하는 식품이 없어요."],
  ["llm-disabled", "메뉴 추천 서비스를 현재 이용할 수 없어요. 관리자에게 문의해 주세요."],
  ["llm-failed", "메뉴를 추천받지 못했어요. 잠시 후 다시 시도해 주세요."],
]) {
  test(`${reason}에 맞는 안내를 표시`, async () => {
    const { result, requestMenu } = setup(async () => ({ reason, suggestion: null }));
    await requestMenu();
    assert.equal(result.textContent, message);
  });
}

test("잘못된 응답이나 빈 추천은 실패로 안내", async () => {
  for (const response of [null, {}, { reason: "unknown" }, { reason: "ok", suggestion: " " }]) {
    const { result, requestMenu } = setup(async () => response);
    await requestMenu();
    assert.match(result.textContent, /다시 시도/);
  }
});

test("통신 실패 후 상태를 복원하고 사용자가 다시 요청할 수 있음", async () => {
  let calls = 0;
  const { button, result, requestMenu } = setup(async () => {
    calls += 1;
    if (calls === 1) throw new Error("network error");
    return { reason: "ok", suggestion: "재시도 성공" };
  });

  await requestMenu();
  assert.equal(calls, 1);
  assert.match(result.textContent, /다시 시도/);
  assert.equal(button.disabled, false);
  assert.equal(button.textContent, "메뉴 추천받기");
  assert.equal(result.attributes.get("aria-busy"), "false");

  await requestMenu();
  assert.equal(calls, 2);
  assert.equal(result.textContent, "재시도 성공");
});

test("API에 재료나 화면 데이터를 인자로 보내지 않기", async () => {
  const { requestMenu } = setup(async (...args) => {
    assert.deepEqual(args, []);
    return { reason: "no-items" };
  });
  await requestMenu();
});

test("추천 결과를 HTML이 아닌 텍스트로 전달", async () => {
  const text = "<strong>두부구이</strong>";
  const { result, requestMenu } = setup(async () => ({ reason: "ok", suggestion: text }));
  await requestMenu();
  assert.equal(result.textContent, text);
  assert.equal(Object.hasOwn(result, "innerHTML"), false);
});

test("연결에 필요한 요소나 API 함수가 없으면 오류를 알림", () => {
  assert.throws(() => bindMenuSuggestion(), TypeError);
  assert.throws(() => bindMenuSuggestion({ button: new FakeElement(), result: new FakeElement(), getMenuSuggestion: null }), TypeError);
});
