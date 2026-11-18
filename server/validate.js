// 요청 본문 검사. 잘못된 입력이면 HttpError(400)를 던진다.
import { DEFAULT_EXPENSE_CATEGORIES } from "../Calcul.js";
import { isValidDate } from "./rules.js";

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const bad = (message) => new HttpError(400, message);
const isName = (v, max = 30) => typeof v === "string" && v.trim() !== "" && v.trim().length <= max;

export function validateMembers(members) {
  if (!Array.isArray(members) || members.length < 2 || members.length > 4) {
    throw bad("함께 사는 사람은 2~4명이어야 합니다.");
  }
  if (!members.every((n) => isName(n))) throw bad("사람 이름은 1~30자로 입력해 주세요.");
  const trimmed = members.map((n) => n.trim());
  if (new Set(trimmed).size !== trimmed.length) throw bad("사람 이름은 서로 다르게 입력해 주세요.");
  return trimmed;
}

// owner(주인)는 비우거나("" = 공용) 멤버 중 한 명이어야 한다.
export function validateOwner(owner, members) {
  if (owner === undefined || owner === "") return owner;
  if (typeof owner !== "string" || !members.includes(owner)) {
    throw bad("주인은 멤버 중 한 명이거나 공용이어야 합니다.");
  }
  return owner;
}

export function validateGroceryItem(item, members = []) {
  if (!item || typeof item !== "object") throw bad("식품 정보가 올바르지 않습니다.");
  if (!isName(item.name, 50)) throw bad("식품 이름은 1~50자로 입력해 주세요.");
  const expirationDate = item.expirationDate ?? "";
  if (expirationDate !== "" && !isValidDate(expirationDate)) {
    throw bad("유통기한은 YYYY-MM-DD 형식이어야 합니다.");
  }
  const storageType = item.storageType ?? "refrigerated";
  if (!["refrigerated", "room-temperature"].includes(storageType)) {
    throw bad("보관 방법은 냉장 또는 실온이어야 합니다.");
  }
  const owner = validateOwner(item.owner, members);
  return { name: item.name.trim(), expirationDate, storageType, ...(owner === undefined ? {} : { owner }) };
}

export function validateExpense(
  body,
  members,
  categories = DEFAULT_EXPENSE_CATEGORIES,
) {
  if (!body || typeof body !== "object") throw bad("요청 형식이 올바르지 않습니다.");
  const { title, amount, payer, participants } = body;
  const category = body.category ?? "기타";
  if (!categories.includes(category)) {
    throw bad("등록된 카테고리를 선택해 주세요.");
  }
  if (!isName(title, 50)) throw bad("지출 내용은 1~50자로 입력해 주세요.");
  if (!Number.isSafeInteger(amount) || amount <= 0) throw bad("금액은 1원 이상의 정수로 입력해 주세요.");
  if (!members.includes(payer)) throw bad("결제한 사람이 멤버 목록에 없습니다.");
  if (!Array.isArray(participants) || participants.length === 0) {
    throw bad("부담할 사람을 한 명 이상 선택해 주세요.");
  }
  if (!participants.every((p) => members.includes(p)) || new Set(participants).size !== participants.length) {
    throw bad("부담할 사람은 멤버 목록에 있는 서로 다른 사람이어야 합니다.");
  }
  return {
    title: title.trim(),
    amount,
    category,
    payer,
    participants,
  };
}

export function validateExpenseCategory(category) {
  if (!isName(category, 30)) throw bad("카테고리는 1~30자로 입력해 주세요.");
  return category.trim();
}

export function validateTransfer(body) {
  const { from, to, amount } = body ?? {};
  if (typeof from !== "string" || typeof to !== "string" || from === to) {
    throw bad("송금하는 사람과 받는 사람이 올바르지 않습니다.");
  }
  if (!Number.isSafeInteger(amount) || amount <= 0) throw bad("송금 금액이 올바르지 않습니다.");
  return { from, to, amount };
}
