const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

// YYYY-MM-DD 형식의 실제 날짜를 밀리초 값으로 변환합니다.
function parseDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new TypeError("날짜는 YYYY-MM-DD 형식이어야 합니다.");
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new RangeError("존재하지 않는 날짜입니다.");
  }

  return date.getTime();
}

// LLM에 보낼 재료를 선택하는 함수
export function selectExpiringIngredients(items, today, thresholdDays = 2) {
  if (!Array.isArray(items)) {
    throw new TypeError("식품 목록은 배열이어야 합니다.");
  }
  if (!Number.isSafeInteger(thresholdDays) || thresholdDays < 0) {
    throw new RangeError("임박 기준 일수는 0 이상의 안전한 정수여야 합니다.");
  }

  const todayTime = parseDate(today);

  return items.filter((item) => {
    if (
      item === null ||
      typeof item !== "object" ||
      Array.isArray(item) ||
      typeof item.name !== "string" ||
      item.name.trim() === "" ||
      typeof item.expirationDate !== "string" ||
      !["available", "consumed", "discarded"].includes(item.status)
    ) {
      throw new TypeError("식품의 이름, 기한, 상태를 확인해 주세요.");
    }

    if (item.expirationDate === "") {
      return false;
    }

    const expirationTime = parseDate(item.expirationDate);
    const daysUntilExpiry = (expirationTime - todayTime) / MILLISECONDS_PER_DAY; // 남은 일수 계산

    return ( // 식품이 사용 가능하고, 남은 일수가 0 이상이며 임박 기준 일수 이하인 경우만 선택
      item.status === "available" &&
      daysUntilExpiry >= 0 &&
      daysUntilExpiry <= thresholdDays
    );
  });
}
