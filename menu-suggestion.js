import { api } from "./api.js";

// 메뉴 추천 실패 시 공통으로 표시하는 문장
const FAILURE_MESSAGE = "메뉴를 추천받지 못했어요. 잠시 후 다시 시도해 주세요.";

// 기존 화면의 버튼과 결과 영역을 받아 메뉴 추천 동작을 연결합니다.
// getMenuSuggestion은 테스트에서 가짜 API 함수로 교체할 수 있습니다.
export function bindMenuSuggestion({
  button,
  result,
  getMenuSuggestion = api.getMenuSuggestion,
} = {}) {
  if (!button || !result || typeof getMenuSuggestion !== "function") {
    throw new TypeError("추천 버튼, 결과 영역 또는 API 함수가 누락되었거나 유효하지 않음.");
  }

  let pending = false;
  result.setAttribute("aria-live", "polite");

  // API를 한 번 요청하고 응답 상태에 맞는 문장을 표시합니다.
  async function requestMenu() {
    if (pending) return;

    pending = true;
    const originalLabel = button.textContent;
    const originalDisabled = button.disabled;
    button.disabled = true;
    button.textContent = "추천 중…";
    result.textContent = "재료를 활용한 메뉴를 찾고 있어요.";
    result.setAttribute("aria-busy", "true");

    try {
      const response = await getMenuSuggestion();

      if (
        response?.reason === "ok" &&
        typeof response.suggestion === "string" &&
        response.suggestion.trim() !== ""
      ) {
        // 서버에서 받은 문장을 HTML로 해석하지 않고 텍스트로 표시
        result.textContent = response.suggestion.trim();
      } else if (response?.reason === "no-items") { // 보관 식품 중 2일 이내에 기한이 도래하는 식품이 없는 경우
        result.textContent = "보관 중인 식품 중 오늘부터 2일 이내에 기한이 도래하는 식품이 없어요.";
      } else if (response?.reason === "llm-disabled") { // LLM 객체가 없거나 비활성화된 경우
        result.textContent = "메뉴 추천 서비스를 현재 이용할 수 없어요. 관리자에게 문의해 주세요.";
      } else {
        result.textContent = FAILURE_MESSAGE;
      }
    } catch {
      // 요청 실패 안내는 메뉴 영역에만 표시
      result.textContent = FAILURE_MESSAGE;
    } finally {
      button.disabled = originalDisabled;
      button.textContent = originalLabel;
      result.setAttribute("aria-busy", "false");
      pending = false;
    }
  }

  button.addEventListener("click", (event) => {
    event.preventDefault();
    void requestMenu();
  });

  // 테스트에서도 요청이 끝날 때까지 기다릴 수 있도록 함수를 반환
  return requestMenu;
}
