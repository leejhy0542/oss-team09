//유통기한 임박 계산 함수
export function getExpiryInfo(expirationDate) {
  if (!expirationDate) {
    return { label: "기한 미입력", className: "expiry-unknown", sortOrder: 3 };
  }

  const [year, month, day] = expirationDate.split("-").map(Number);
  const expiration = Date.UTC(year, month - 1, day);
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const daysUntilExpiry = Math.round((expiration - today) / 86_400_000);

  if (daysUntilExpiry < 0) {
    return { label: "폐기 확인", className: "expiry-expired", sortOrder: 0 };
  }
  if (daysUntilExpiry <= 2) {
    return {
      label: daysUntilExpiry === 0 ? "오늘까지" : `${daysUntilExpiry}일 이내`,
      className: "expiry-soon",
      sortOrder: 1,
    };
  }
  return { label: "여유", className: "expiry-fresh", sortOrder: 2 };
}

//공동 비용 계산 규칙 함수
export function calculateShares(amount, participants, payer) {
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new RangeError("금액은 1원 이상의 안전한 정수여야 합니다.");
  }
  if (!Array.isArray(participants) || participants.length === 0) {
    throw new TypeError("부담할 사람을 한 명 이상 선택해야 합니다.");
  }
  if (
    participants.some(
      (name) =>
        typeof name !== "string" ||
        name.trim() === "" ||
        name !== name.trim(),
    ) ||
    new Set(participants).size !== participants.length
  ) {
    throw new TypeError("참여자 이름은 비어 있지 않고 서로 달라야 합니다.");
  }
  if (
    typeof payer !== "string" ||
    payer.trim() === "" ||
    payer !== payer.trim()
  ) {
    throw new TypeError("결제한 사람을 지정해야 합니다.");
  }

  const baseShare = Math.floor(amount / participants.length);
  const remainder = amount % participants.length;
  const shares = new Map(participants.map((name) => [name, baseShare]));
  shares.set(payer, (shares.get(payer) ?? 0) + remainder);

  return Array.from(shares, ([name, share]) => ({ name, amount: share }));
}

//1인당 최소 송금액 계산 규칙 함수
export function calculateMinimumTransfers(balances) {
  if (!balances || typeof balances !== "object" || Array.isArray(balances)) {
    throw new TypeError("정산 잔액은 사람별 금액 객체여야 합니다.");
  }

  const entries = Object.entries(balances);
  if (
    entries.some(
      ([name, amount]) =>
        name.trim() === "" ||
        name !== name.trim() ||
        !Number.isSafeInteger(amount),
    )
  ) {
    throw new TypeError("정산 잔액은 이름과 안전한 정수 금액이어야 합니다.");
  }
  const balanceTotal = entries.reduce((total, [, amount]) => {
    const nextTotal = total + amount;
    if (!Number.isSafeInteger(nextTotal)) {
      throw new RangeError("정산 잔액 합계가 안전한 계산 범위를 초과했습니다.");
    }
    return nextTotal;
  }, 0);
  if (balanceTotal !== 0) {
    throw new RangeError("정산 잔액의 합계가 0이 아닙니다.");
  }

  const names = entries.map(([name]) => name);
  const remaining = entries.map(([, amount]) => amount);
  const transfers = [];
  let bestTransfers = null;

  function search() {
    const first = remaining.findIndex((amount) => amount !== 0);
    if (first === -1) {
      if (bestTransfers === null || transfers.length < bestTransfers.length) {
        bestTransfers = transfers.map((transfer) => ({ ...transfer }));
      }
      return;
    }
    if (bestTransfers !== null && transfers.length >= bestTransfers.length) {
      return;
    }

    const triedBalances = new Set();
    for (let index = first + 1; index < remaining.length; index += 1) {
      if (remaining[index] === 0) {
        continue;
      }
      if (
        (remaining[first] < 0 && remaining[index] < 0) ||
        (remaining[first] > 0 && remaining[index] > 0)
      ) {
        continue;
      }
      if (triedBalances.has(remaining[index])) {
        continue;
      }
      triedBalances.add(remaining[index]);

      const firstBalance = remaining[first];
      const otherBalance = remaining[index];
      const amount = Math.min(
        Math.abs(firstBalance),
        Math.abs(otherBalance),
      );
      if (remaining[first] < 0) {
        remaining[first] += amount;
        remaining[index] -= amount;
        transfers.push({
          from: names[first],
          to: names[index],
          amount,
        });
      } else {
        remaining[first] -= amount;
        remaining[index] += amount;
        transfers.push({
          from: names[index],
          to: names[first],
          amount,
        });
      }

      search();

      transfers.pop();
      remaining[first] = firstBalance;
      remaining[index] = otherBalance;
    }
  }

  search();
  return bestTransfers ?? [];
}
