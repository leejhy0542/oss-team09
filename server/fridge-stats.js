// 계산 규칙 5번: 사람별 냉장고 점유
// 식품의 주인(owner)을 기준으로 사람별 등록 수, 상태별 수, 폐기율을 계산한다.
// 주인이 없는 식품은 다 같이 먹는 공용 식품으로 본다.
export const NO_OWNER = "공용";

function emptyRow(name) {
  return { name, total: 0, available: 0, consumed: 0, discarded: 0, discardRate: null };
}

// 폐기율(%) = 폐기 수 ÷ (다 먹음 + 폐기) × 100, 소수 첫째 자리에서 반올림.
// 보관 중인 식품은 아직 결과가 나오지 않았으므로 빼고, 끝난 식품이 없으면 null.
export function calculateDiscardRate(consumed, discarded) {
  const finished = consumed + discarded;
  if (finished === 0) return null;
  return Math.round((discarded / finished) * 1000) / 10;
}

export function calculateFridgeStats(members, fridgeItems) {
  if (!Array.isArray(members) || !Array.isArray(fridgeItems)) {
    throw new TypeError("멤버와 식품 목록은 배열이어야 합니다.");
  }

  const rows = new Map(members.map((name) => [name, emptyRow(name)]));
  const noOwner = emptyRow(NO_OWNER);

  for (const item of fridgeItems) {
    // 주인이 없거나 지금 멤버가 아니면 "공용"으로 센다
    const row = rows.get(item?.owner) ?? noOwner;
    row.total += 1;
    if (item?.status === "consumed") row.consumed += 1;
    else if (item?.status === "discarded") row.discarded += 1;
    else row.available += 1;
  }

  const result = [...rows.values(), ...(noOwner.total > 0 ? [noOwner] : [])];
  for (const row of result) {
    row.discardRate = calculateDiscardRate(row.consumed, row.discarded);
  }
  return result;
}
