import test from "node:test";
import assert from "node:assert/strict";
import { createLlmClient } from "../server/menu/llm-client.js";

// 모든 테스트는 가짜 키·모델·통신 함수를 사용, 환경변수나 실제 API를 사용하지 않음
// 실제 API 호출 테스트는 별도의 수동 테스트로 확인
function makeClient(fetchImpl, options = {}) {
  return createLlmClient({
    apiKey: "test-key",
    model: "test-model",
    fetchImpl,
    ...options,
  });
}

function reply(parts = [{ text: "두부구이: 두부를 노릇하게 구우세요." }], finishReason = "STOP") {
  return Response.json({ candidates: [{ finishReason, content: { parts } }] });
}

test("정상 요청에 모델, 인증, 재료와 출력 제한을 전달", async () => {
  let calls = 0;
  const client = makeClient(async (url, options) => {
    calls += 1;
    assert.equal(url, "https://generativelanguage.googleapis.com/v1beta/models/test-model:generateContent");
    assert.equal(url.includes("test-key"), false);
    assert.equal(options.method, "POST");
    assert.equal(options.headers["x-goog-api-key"], "test-key");
    assert.equal(options.headers["Content-Type"], "application/json");
    assert.ok(options.signal instanceof AbortSignal);
    const body = JSON.parse(options.body);
    assert.deepEqual(JSON.parse(body.contents[0].parts[0].text), ["두부", "달걀"]);
    assert.equal(typeof body.systemInstruction.parts[0].text, "string");
    assert.equal(body.generationConfig.maxOutputTokens, 512);
    return reply();
  });

  assert.equal(client.enabled, true);
  assert.equal(await client.suggestMenu([" 두부 ", "달걀"]), "두부구이: 두부를 노릇하게 구우세요.");
  assert.equal(calls, 1);
});

test("키 또는 모델이 없으면 비활성화하고 통신하지 않음", async () => {
  let calls = 0;
  const fakeFetch = async () => { calls += 1; return reply(); };
  for (const options of [{ apiKey: "" }, { model: " " }, { apiKey: null }]) {
    const client = makeClient(fakeFetch, options);
    assert.equal(client.enabled, false);
    assert.equal(await client.suggestMenu(["두부"]), null);
  }
  assert.equal(calls, 0);
});

test("빈 재료와 잘못된 입력에는 통신하지 않음", async () => {
  let calls = 0;
  const client = makeClient(async () => { calls += 1; return reply(); });
  for (const items of [[], null, "두부", [null], [" "], [{ name: "두부" }]]) {
    assert.equal(await client.suggestMenu(items), null);
  }
  assert.equal(calls, 0);
});

for (const status of [429, 500, 503]) {
  test(`HTTP ${status}는 null을 반환하고 재시도하지 않음`, async () => {
    let calls = 0;
    const client = makeClient(async () => {
      calls += 1;
      return new Response("error", { status });
    });
    assert.equal(await client.suggestMenu(["두부"]), null);
    assert.equal(calls, 1);
  });
}

test("네트워크 오류는 null을 반환", async () => {
  const client = makeClient(async () => { throw new Error("network error"); });
  assert.equal(await client.suggestMenu(["두부"]), null);
});

test("잘못된 JSON은 null을 반환", async () => {
  const client = makeClient(async () => new Response("not json"));
  assert.equal(await client.suggestMenu(["두부"]), null);
});

test("빈 응답과 잘못된 응답 구조는 null을 반환", async () => {
  for (const data of [null, {}, { candidates: [] }, { candidates: [{ finishReason: "STOP", content: { parts: "wrong" } }] }]) {
    const client = makeClient(async () => Response.json(data));
    assert.equal(await client.suggestMenu(["두부"]), null);
  }
  const client = makeClient(async () => reply([{ text: "  " }]));
  assert.equal(await client.suggestMenu(["두부"]), null);
});

test("차단되거나 토큰 제한으로 잘린 응답은 추천으로 반환하지 않음", async () => {
  for (const reason of ["SAFETY", "MAX_TOKENS"]) {
    const client = makeClient(async () => reply([{ text: "불완전한 응답" }], reason));
    assert.equal(await client.suggestMenu(["두부"]), null);
  }
  const client = makeClient(async () => Response.json({ promptFeedback: { blockReason: "SAFETY" } }));
  assert.equal(await client.suggestMenu(["두부"]), null);
});

test("추론 부분을 제외하고 여러 텍스트를 한 줄로 정리", async () => {
  const client = makeClient(async () => reply([
    { thought: true, text: "내부 추론" },
    { text: " 두부구이:\n" },
    { text: "두부를 구우세요. " },
  ]));
  assert.equal(await client.suggestMenu(["두부"]), "두부구이: 두부를 구우세요.");
});

test("시간 초과 시 요청을 중단하고 null을 반환", async () => {
  let signal;
  const client = makeClient((url, options) => {
    signal = options.signal;
    return new Promise((resolve, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    });
  }, { timeoutMs: 20 });

  assert.equal(await client.suggestMenu(["두부"]), null);
  assert.equal(signal.aborted, true);
});

test("응답 본문을 읽는 중 시간 초과가 발생하면 중단", async () => {
  const client = makeClient(async (url, { signal }) => ({
    ok: true,
    json: () => new Promise((resolve, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    }),
  }), { timeoutMs: 20 });
  assert.equal(await client.suggestMenu(["두부"]), null);
});

test("성공 후에는 시간 제한 타이머를 정리", async () => {
  let signal;
  const client = makeClient(async (url, options) => {
    signal = options.signal;
    return reply();
  }, { timeoutMs: 20 });
  assert.notEqual(await client.suggestMenu(["두부"]), null);
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(signal.aborted, false);
});

test("잘못된 시간 제한 설정을 거부", () => {
  for (const timeoutMs of [0, -1, 1.5, Infinity, 2_147_483_648]) {
    assert.throws(() => makeClient(async () => reply(), { timeoutMs }), RangeError);
  }
});
