// 서버에서 쓰는 계산 규칙. 화면 없이 테스트할 수 있도록 순수 함수로 둔다.
import { calculateShares } from "../Calcul.js";

export const DAY_MS = 86_400_000;

// 지출과 완료된 송금으로 사람별 잔액을 계산한다. 양수는 받을 돈, 음수는 보낼 돈.
export function calculateBalances({ members, expenses, completedTransfers = [], settledExpenseIds = [] }) {
  const balances = new Map(members.map((name) => [name, 0]));
  const add = (name, delta) => {
    const next = (balances.get(name) ?? 0) + delta;
    if (!Number.isSafeInteger(next)) {
      throw new RangeError("누적 금액이 안전한 계산 범위를 초과했습니다.");
    }
    balances.set(name, next);
  };

  const settled = new Set(settledExpenseIds);
  for (const expense of expenses) {
    if (settled.has(expense.id)) continue;
    add(expense.payer, expense.amount);
    for (const { name, amount } of calculateShares(expense.amount, expense.participants, expense.payer)) {
      add(name, -amount);
    }
  }
  for (const { from, to, amount } of completedTransfers) {
    add(from, amount);
    add(to, -amount);
  }
  return Object.fromEntries(balances);
}

// "YYYY-MM-DD" 형식이고 실제로 있는 날짜인지 검사한다.
export function isValidDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

// 한국 시간 기준 오늘 날짜를 "YYYY-MM-DD"로 돌려준다. 배포 서버는 UTC일 수 있어서 시간대를 고정한다.
export function todayInSeoul(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(now);
}

// 유통기한 판정: 지났으면 expired, 오늘~2일 이내면 soon, 그 이후면 fresh, 기한이 없으면 unknown.
export function getExpiryStatus(expirationDate, today) {
  if (!expirationDate) return { status: "unknown", daysLeft: null };
  const toUtc = (s) => {
    const [y, m, d] = s.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  const daysLeft = Math.round((toUtc(expirationDate) - toUtc(today)) / DAY_MS);
  if (daysLeft < 0) return { status: "expired", daysLeft };
  if (daysLeft <= 2) return { status: "soon", daysLeft };
  return { status: "fresh", daysLeft };
}

// 품목 이름 비교용 정규화 (공백 제거, 소문자)
export function normalizeName(name) {
  return name.trim().toLocaleLowerCase("ko-KR");
}

// 다 먹음·폐기로 바꾼 식품은 일주일 동안만 목록에 남긴다.
export const FRIDGE_RETENTION_MS = 7 * DAY_MS;

export function isFridgeItemVisible(item, now = new Date()) {
  if (item.status === "available" || !item.statusChangedAt) return true;
  const changedAt = Date.parse(item.statusChangedAt);
  if (Number.isNaN(changedAt)) return true;
  return now.getTime() - changedAt < FRIDGE_RETENTION_MS;
}
