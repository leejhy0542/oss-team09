import { calculateMinimumTransfers, calculateShares } from "./Calcul.js";

const STORAGE_KEY = "moasseum-expense-ledger";
const FRIDGE_STATUS_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_MEMBERS = ["나", "룸메이트 1"];
const wonFormatter = new Intl.NumberFormat("ko-KR");

const elements = {
  stateNotice: document.querySelector("#state-notice"),
  form: document.querySelector("#expense-form"),
  expenseName: document.querySelector("#expense-name"),
  expenseAmount: document.querySelector("#expense-amount"),
  groceryName: document.querySelector("#grocery-name"),
  groceryExpiration: document.querySelector("#grocery-expiration"),
  groceryStorageType: document.querySelector("#grocery-storage-type"),
  addGroceryItem: document.querySelector("#add-grocery-item"),
  groceryDraftList: document.querySelector("#grocery-draft-list"),
  payer: document.querySelector("#payer"),
  splitParticipants: document.querySelector("#split-participants"),
  memberList: document.querySelector("#member-list"),
  memberCount: document.querySelector("#member-count"),
  addMember: document.querySelector("#add-member"),
  memberBalances: document.querySelector("#member-balances"),
  transferCount: document.querySelector("#transfer-count"),
  transferList: document.querySelector("#transfer-list"),
  completedTransferCount: document.querySelector("#completed-transfer-count"),
  completedTransferList: document.querySelector("#completed-transfer-list"),
  expenseList: document.querySelector("#expense-list"),
  clearExpenses: document.querySelector("#clear-expenses"),
  fridgeCount: document.querySelector("#fridge-count"),
  fridgeSummary: document.querySelector("#fridge-summary"),
  fridgeList: document.querySelector("#fridge-list"),
  shoppingForm: document.querySelector("#shopping-form"),
  shoppingItemName: document.querySelector("#shopping-item-name"),
  shoppingCount: document.querySelector("#shopping-count"),
  shoppingList: document.querySelector("#shopping-list"),
};

function isValidSavedState(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    Array.isArray(value.members) &&
    value.members.length >= 2 &&
    value.members.length <= 4 &&
    value.members.every((name) => typeof name === "string" && name.trim() !== "") &&
    new Set(value.members).size === value.members.length &&
    Array.isArray(value.expenses) &&
    value.expenses.every(
      (expense) =>
        expense !== null &&
        typeof expense === "object" &&
        typeof expense.id === "string" &&
        typeof expense.title === "string" &&
        Number.isSafeInteger(expense.amount) &&
        expense.amount > 0 &&
        typeof expense.payer === "string" &&
        Array.isArray(expense.participants) &&
        expense.participants.length > 0 &&
        expense.participants.every((name) => typeof name === "string") &&
        (expense.groceryItems === undefined ||
          (Array.isArray(expense.groceryItems) &&
            expense.groceryItems.every((name) => typeof name === "string"))) &&
        typeof expense.createdAt === "string",
    ) &&
    (value.settledExpenseIds === undefined ||
      (Array.isArray(value.settledExpenseIds) &&
        value.settledExpenseIds.every((id) => typeof id === "string"))) &&
    (value.completedTransfers === undefined ||
      (Array.isArray(value.completedTransfers) &&
        value.completedTransfers.every(
          (transfer) =>
            transfer !== null &&
            typeof transfer === "object" &&
            typeof transfer.id === "string" &&
            typeof transfer.from === "string" &&
            typeof transfer.to === "string" &&
            Number.isSafeInteger(transfer.amount) &&
            transfer.amount > 0 &&
            typeof transfer.completedAt === "string",
        ))) &&
    (value.fridgeItems === undefined ||
      (Array.isArray(value.fridgeItems) &&
        value.fridgeItems.every(
          (item) =>
            item !== null &&
            typeof item === "object" &&
            typeof item.id === "string" &&
            typeof item.name === "string" &&
            typeof item.expirationDate === "string" &&
            (item.expirationDate === "" || isValidDate(item.expirationDate)) &&
            (item.storageType === undefined ||
              ["refrigerated", "room-temperature"].includes(item.storageType)) &&
            typeof item.purchasedAt === "string" &&
            typeof item.expenseId === "string" &&
            ["available", "consumed", "discarded"].includes(item.status) &&
            (item.statusChangedAt === undefined ||
              (typeof item.statusChangedAt === "string" &&
                !Number.isNaN(Date.parse(item.statusChangedAt)))),
        ))) &&
    (value.shoppingList === undefined ||
      (Array.isArray(value.shoppingList) &&
        value.shoppingList.every(
          (item) =>
            item !== null &&
            typeof item === "object" &&
            typeof item.id === "string" &&
            typeof item.name === "string",
        )))
  );
}

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === null) {
      return {
        members: [...DEFAULT_MEMBERS],
        expenses: [],
        settledExpenseIds: [],
        completedTransfers: [],
        fridgeItems: [],
        shoppingList: [],
      };
    }

    const value = JSON.parse(saved);
    if (!isValidSavedState(value)) {
      throw new Error("저장된 지출 정보의 형식이 올바르지 않습니다.");
    }
    return value;
  } catch (error) {
    elements.stateNotice.textContent =
      `저장된 정보를 불러오지 못했습니다. 새 장부로 시작합니다. (${error.message})`;
    return {
      members: [...DEFAULT_MEMBERS],
      expenses: [],
      settledExpenseIds: [],
      completedTransfers: [],
      fridgeItems: [],
      shoppingList: [],
    };
  }
}

const savedState = loadState();
let { members, expenses } = savedState;
let settledExpenseIds = savedState.settledExpenseIds ?? [];
let completedTransfers = savedState.completedTransfers ?? [];
let fridgeItems = savedState.fridgeItems ?? [];
let shoppingList = savedState.shoppingList ?? [];
let groceryDraftItems = [];
let fridgeCleanupTimer;

function formatWon(amount) {
  return `₩${wonFormatter.format(amount)}`;
}

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function showNotice(message) {
  elements.stateNotice.textContent = message;
}

function saveState() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        members,
        expenses,
        settledExpenseIds,
        completedTransfers,
        fridgeItems,
        shoppingList,
      }),
    );
    showNotice("");
  } catch (error) {
    showNotice(`브라우저에 기록을 저장하지 못했습니다. (${error.message})`);
  }
}

function createElement(tagName, className, text) {
  const element = document.createElement(tagName);
  if (className) {
    element.className = className;
  }
  if (text !== undefined) {
    element.textContent = text;
  }
  return element;
}

function getRosterError() {
  if (members.length < 2 || members.length > 4) {
    return "함께 사는 사람은 2~4명이어야 합니다.";
  }
  if (members.some((name) => name.trim() === "")) {
    return "사람 이름을 비워 둘 수 없습니다.";
  }
  if (new Set(members).size !== members.length) {
    return "사람 이름은 서로 다르게 입력해 주세요.";
  }
  return "";
}

function renderMemberEditor() {
  const locked = expenses.length > 0;
  elements.memberList.replaceChildren();
  elements.memberCount.textContent = `${members.length}명`;
  elements.addMember.disabled = locked || members.length >= 4;

  members.forEach((name, index) => {
    const row = createElement("div", "member-edit-row");
    const input = createElement("input", "text-input");
    input.type = "text";
    input.maxLength = 30;
    input.value = name;
    input.setAttribute("aria-label", `${index + 1}번째 사람 이름`);
    input.disabled = locked;
    row.append(input);

    const removeButton = createElement("button", "icon-button", "×");
    removeButton.type = "button";
    removeButton.setAttribute("aria-label", `${name || `${index + 1}번째 사람`} 삭제`);
    removeButton.disabled = locked || members.length <= 2;
    removeButton.addEventListener("click", () => {
      members = members.filter((_, memberIndex) => memberIndex !== index);
      render();
      saveState();
    });
    row.append(removeButton);
    elements.memberList.append(row);
  });
}

function renderParticipantControls() {
  elements.payer.replaceChildren();
  elements.splitParticipants.replaceChildren();

  members.forEach((name, index) => {
    const payerOption = createElement("option", "", name || `이름 ${index + 1}`);
    payerOption.value = name;
    elements.payer.append(payerOption);

    const label = createElement("label", "participant-chip");
    const checkbox = createElement("input");
    checkbox.type = "checkbox";
    checkbox.name = "split";
    checkbox.value = name;
    checkbox.checked = true;
    checkbox.id = `split-${index}`;
    const text = createElement("span", "", name || `이름 ${index + 1}`);
    label.append(checkbox, text);
    elements.splitParticipants.append(label);
  });
}

function calculateBalances() {
  const balances = new Map(members.map((name) => [name, 0]));

  getPendingExpenses().forEach((expense) => {
    if (!balances.has(expense.payer)) {
      balances.set(expense.payer, 0);
    }
    const payerBalance = balances.get(expense.payer) + expense.amount;
    if (!Number.isSafeInteger(payerBalance)) {
      throw new RangeError("누적 지출 금액이 안전한 계산 범위를 초과했습니다.");
    }
    balances.set(expense.payer, payerBalance);

    const shares = calculateShares(
      expense.amount,
      expense.participants,
      expense.payer,
    );
    shares.forEach(({ name, amount }) => {
      if (!balances.has(name)) {
        balances.set(name, 0);
      }
      const balance = balances.get(name) - amount;
      if (!Number.isSafeInteger(balance)) {
        throw new RangeError("누적 부담 금액이 안전한 계산 범위를 초과했습니다.");
      }
      balances.set(name, balance);
    });
  });

  completedTransfers.forEach(({ from, to, amount }) => {
    if (!balances.has(from)) {
      balances.set(from, 0);
    }
    if (!balances.has(to)) {
      balances.set(to, 0);
    }
    const senderBalance = balances.get(from) + amount;
    const recipientBalance = balances.get(to) - amount;
    if (!Number.isSafeInteger(senderBalance) || !Number.isSafeInteger(recipientBalance)) {
      throw new RangeError("완료된 송금이 안전한 계산 범위를 초과했습니다.");
    }
    balances.set(from, senderBalance);
    balances.set(to, recipientBalance);
  });

  return Object.fromEntries(balances);
}

function getPendingExpenses() {
  const settledIds = new Set(settledExpenseIds);
  return expenses.filter((expense) => !settledIds.has(expense.id));
}

function completeTransfer(from, to, amount) {
  if (
    typeof from !== "string" ||
    typeof to !== "string" ||
    from === to ||
    !Number.isSafeInteger(amount) ||
    amount <= 0
  ) {
    showNotice("송금 완료 정보를 처리할 수 없습니다.");
    return;
  }

  completedTransfers = [
    ...completedTransfers,
    {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      from,
      to,
      amount,
      completedAt: new Date().toISOString(),
    },
  ];
  render();
  saveState();
}

function renderSettlement() {
  elements.memberBalances.replaceChildren();
  elements.transferList.replaceChildren();
  elements.completedTransferList.replaceChildren();

  try {
    const balances = calculateBalances();
    const transfers = calculateMinimumTransfers(balances);
    elements.transferCount.textContent = `${transfers.length}건`;
    elements.completedTransferCount.textContent = `${completedTransfers.length}건`;

    members.forEach((name) => {
      const balance = balances[name] ?? 0;
      const row = createElement("div", "balance-row");
      const identity = createElement("div", "balance-name");
      identity.append(
        createElement("span", "avatar-dot", name.trim().slice(0, 1) || "?"),
        createElement("span", "", name),
      );
      const value = createElement("span", "balance-value");
      if (balance > 0) {
        value.classList.add("receivable");
        value.textContent = `받을 금액 ${formatWon(balance)}`;
      } else if (balance < 0) {
        value.classList.add("owed");
        value.textContent = `보낼 금액 ${formatWon(Math.abs(balance))}`;
      } else {
        value.classList.add("settled");
        value.textContent = "정산 완료";
      }
      row.append(identity, value);
      elements.memberBalances.append(row);
    });

    if (transfers.length === 0) {
      elements.transferList.append(
        createElement(
          "p",
          "empty-state",
          expenses.length === 0
            ? "장보기를 기록하면 필요한 송금만 모아 보여드려요."
            : "대기 중인 송금이 없어요. 새 지출이 생기면 여기에 표시됩니다.",
        ),
      );
    } else {
      transfers.forEach(({ from, to, amount }) => {
        const row = createElement("div", "transfer-row");
        const route = createElement("div", "transfer-route");
        route.append(
          createElement("span", "transfer-from", from),
          createElement("span", "transfer-arrow", "→"),
          createElement("span", "transfer-to", to),
        );
        const actions = createElement("div", "transfer-actions");
        actions.append(createElement("span", "transfer-amount", formatWon(amount)));
        const completeButton = createElement("button", "small-action-button", "이 송금 완료");
        completeButton.type = "button";
        completeButton.setAttribute(
          "aria-label",
          `${from}에서 ${to}에게 ${formatWon(amount)} 송금 완료 처리`,
        );
        completeButton.addEventListener("click", () => {
          completeTransfer(from, to, amount);
        });
        actions.append(completeButton);
        row.append(route, actions);
        elements.transferList.append(row);
      });
    }

    if (completedTransfers.length === 0) {
      elements.completedTransferList.append(
        createElement("p", "empty-state", "송금을 완료하면 여기에 기록돼요."),
      );
    } else {
      [...completedTransfers].reverse().forEach((transfer) => {
        const row = createElement("div", "transfer-row completed-transfer-row");
        const route = createElement("div", "transfer-route");
        route.append(
          createElement("span", "transfer-from", transfer.from),
          createElement("span", "transfer-arrow", "→"),
          createElement("span", "transfer-to", transfer.to),
        );
        const completedAt = new Date(transfer.completedAt);
        const dateLabel = Number.isNaN(completedAt.getTime())
          ? ""
          : completedAt.toLocaleDateString("ko-KR");
        const amount = createElement("span", "transfer-amount", formatWon(transfer.amount));
        const meta = createElement(
          "span",
          "completed-transfer-meta",
          `${dateLabel}${dateLabel ? " · " : ""}완료`,
        );
        const details = createElement("div", "completed-transfer-details");
        details.append(amount, meta);
        row.append(route, details);
        elements.completedTransferList.append(row);
      });
    }
  } catch (error) {
    elements.transferCount.textContent = "계산 오류";
    elements.memberBalances.append(
      createElement("p", "empty-state", "정산 결과를 계산하지 못했습니다."),
    );
    elements.transferList.append(
      createElement("p", "empty-state", error.message),
    );
  }
}

function renderExpenses() {
  elements.expenseList.replaceChildren();
  elements.clearExpenses.hidden = expenses.length === 0;

  if (expenses.length === 0) {
    elements.expenseList.append(
      createElement("p", "empty-state", "아직 지출 내역이 없어요. 첫 지출을 기록해 보세요."),
    );
    return;
  }

  [...expenses].reverse().forEach((expense) => {
    const row = createElement("article", "expense-row");
    const info = createElement("div", "expense-info");
    info.append(createElement("p", "expense-title", expense.title));
    const date = new Date(expense.createdAt);
    const dateLabel = Number.isNaN(date.getTime())
      ? ""
      : `${date.toLocaleDateString("ko-KR")} · `;
    info.append(
      createElement(
        "p",
        "expense-meta",
        `${dateLabel}${expense.payer} 결제 · ${expense.participants.join(", ")} 부담${
          expense.groceryItems?.length
            ? ` · 식품 ${expense.groceryItems.join(", ")}`
            : ""
        }`,
      ),
    );

    const right = createElement("div", "expense-right");
    const expenseDetails = createElement("div", "expense-details");
    const settled = settledExpenseIds.includes(expense.id);
    expenseDetails.append(
      createElement(
        "span",
        `expense-status ${settled ? "is-settled" : "is-pending"}`,
        settled ? "정산 완료" : "정산 대기",
      ),
      createElement("span", "expense-amount", formatWon(expense.amount)),
    );
    right.append(expenseDetails);
    const deleteButton = createElement("button", "delete-expense", "×");
    deleteButton.type = "button";
    deleteButton.setAttribute("aria-label", `${expense.title} 지출 삭제`);
    deleteButton.addEventListener("click", () => {
      expenses = expenses.filter((item) => item.id !== expense.id);
      settledExpenseIds = settledExpenseIds.filter((id) => id !== expense.id);
      render();
      saveState();
    });
    right.append(deleteButton);
    row.append(info, right);
    elements.expenseList.append(row);
  });
}

function getExpiryInfo(expirationDate) {
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

function renderGroceryDrafts() {
  elements.groceryDraftList.replaceChildren();
  groceryDraftItems.forEach((item, index) => {
    const row = createElement("div", "grocery-draft-row");
    const detail = createElement("span", "grocery-draft-detail");
    detail.append(
      createElement("span", "grocery-draft-name", item.name),
      createElement(
        "span",
        "grocery-draft-expiry",
        [
          item.category,
          item.storageType === "room-temperature" ? "실온 보관" : "냉장 보관",
          item.expirationDate ? `기한 ${item.expirationDate}` : "기한 미입력",
        ]
          .filter(Boolean)
          .join(" · "),
      ),
    );
    const removeButton = createElement("button", "delete-expense", "×");
    removeButton.type = "button";
    removeButton.setAttribute("aria-label", `${item.name} 식품 입력 취소`);
    removeButton.addEventListener("click", () => {
      groceryDraftItems = groceryDraftItems.filter((_, itemIndex) => itemIndex !== index);
      renderGroceryDrafts();
    });
    row.append(detail, removeButton);
    elements.groceryDraftList.append(row);
  });
}

function removeExpiredFridgeItems() {
  const now = Date.now();
  const remainingItems = fridgeItems.filter((item) => {
    if (item.status === "available" || !item.statusChangedAt) {
      return true;
    }
    const statusChangedAt = Date.parse(item.statusChangedAt);
    return (
      Number.isNaN(statusChangedAt) ||
      now - statusChangedAt < FRIDGE_STATUS_RETENTION_MS
    );
  });
  const removedItems = remainingItems.length !== fridgeItems.length;
  fridgeItems = remainingItems;
  return removedItems;
}

function scheduleFridgeCleanup() {
  window.clearTimeout(fridgeCleanupTimer);
  const nextExpiration = fridgeItems.reduce((earliest, item) => {
    if (item.status === "available" || !item.statusChangedAt) {
      return earliest;
    }
    const expiration =
      Date.parse(item.statusChangedAt) + FRIDGE_STATUS_RETENTION_MS;
    return Number.isNaN(expiration)
      ? earliest
      : Math.min(earliest, expiration);
  }, Number.POSITIVE_INFINITY);
  if (!Number.isFinite(nextExpiration)) {
    return;
  }

  fridgeCleanupTimer = window.setTimeout(() => {
    if (removeExpiredFridgeItems()) {
      render();
      saveState();
    }
    scheduleFridgeCleanup();
  }, Math.max(0, nextExpiration - Date.now()));
}

function addToShoppingList(name) {
  const normalizedName = name.trim().toLocaleLowerCase("ko-KR");
  if (
    normalizedName === "" ||
    shoppingList.some(
      (item) => item.name.trim().toLocaleLowerCase("ko-KR") === normalizedName,
    )
  ) {
    return false;
  }
  shoppingList = [
    ...shoppingList,
    {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name: name.trim(),
    },
  ];
  return true;
}

function renderFridge() {
  elements.fridgeList.replaceChildren();
  const availableItems = fridgeItems
    .filter((item) => item.status === "available")
    .sort((a, b) => {
      const expiryDifference =
        getExpiryInfo(a.expirationDate).sortOrder -
        getExpiryInfo(b.expirationDate).sortOrder;
      return expiryDifference || a.expirationDate.localeCompare(b.expirationDate);
    });
  const expiredCount = availableItems.filter(
    (item) => getExpiryInfo(item.expirationDate).className === "expiry-expired",
  ).length;
  const soonCount = availableItems.filter(
    (item) => getExpiryInfo(item.expirationDate).className === "expiry-soon",
  ).length;
  elements.fridgeCount.textContent = `${availableItems.length}개 보관 중`;
  elements.fridgeSummary.textContent =
    `${soonCount ? `임박 ${soonCount}개` : "임박 식품 없음"} · ${
      expiredCount ? `기한 확인 ${expiredCount}개` : "기한 지난 식품 없음"
    }`;

  if (fridgeItems.length === 0) {
    elements.fridgeList.append(
      createElement(
        "p",
        "empty-state",
        "장보기 기록에 식품을 추가하면 이곳에서 함께 관리할 수 있어요.",
      ),
    );
    return;
  }

  const statusLabels = {
    available: "보관 중",
    consumed: "다 먹음",
    discarded: "폐기",
  };
  const sortedItems = [...availableItems, ...fridgeItems.filter((item) => item.status !== "available")];
  sortedItems.forEach((item) => {
    const row = createElement("article", "fridge-item");
    const details = createElement("div", "fridge-item-details");
    const nameLine = createElement("div", "fridge-item-name-line");
    nameLine.append(createElement("p", "fridge-item-name", item.name));
    const storageType = item.storageType ?? "refrigerated";
    nameLine.append(
      createElement(
        "span",
        `storage-badge ${storageType === "room-temperature" ? "storage-room" : "storage-cold"}`,
        storageType === "room-temperature" ? "실온 보관" : "냉장 보관",
      ),
    );
    details.append(nameLine);
    const purchasedAt = new Date(item.purchasedAt);
    const purchasedDate = Number.isNaN(purchasedAt.getTime())
      ? ""
      : purchasedAt.toLocaleDateString("ko-KR");
    const expiryText = item.expirationDate
      ? `기한 ${item.expirationDate}`
      : "기한 미입력";
    details.append(
      createElement(
        "p",
        "fridge-item-meta",
        `${purchasedDate ? `${purchasedDate} 구매 · ` : ""}${expiryText}`,
      ),
    );

    const actions = createElement("div", "fridge-item-actions");
    if (item.status === "available") {
      const expiry = getExpiryInfo(item.expirationDate);
      actions.append(createElement("span", `expiry-badge ${expiry.className}`, expiry.label));

      const consumeButton = createElement("button", "small-action-button", "다 먹음");
      consumeButton.type = "button";
      consumeButton.addEventListener("click", () => {
        updateFridgeItemStatus(item.id, "consumed");
      });
      actions.append(consumeButton);

      const discardButton = createElement("button", "small-action-button discard-action", "폐기");
      discardButton.type = "button";
      discardButton.addEventListener("click", () => {
        updateFridgeItemStatus(item.id, "discarded");
      });
      actions.append(discardButton);
    } else {
      actions.append(
        createElement(
          "span",
          `expiry-badge ${item.status === "consumed" ? "expiry-consumed" : "expiry-discarded"}`,
          `${statusLabels[item.status]}`,
        ),
      );
      const cancelButton = createElement("button", "small-action-button", "취소");
      cancelButton.type = "button";
      cancelButton.setAttribute("aria-label", `${item.name} 상태 변경 취소`);
      cancelButton.addEventListener("click", () => {
        updateFridgeItemStatus(item.id, "available");
      });
      actions.append(cancelButton);

      const restockButton = createElement("button", "small-action-button", "다음 장보기에 담기");
      restockButton.type = "button";
      restockButton.addEventListener("click", () => {
        if (addToShoppingList(item.name)) {
          renderShoppingList();
          saveState();
        }
      });
      actions.append(restockButton);
    }

    row.append(details, actions);
    elements.fridgeList.append(row);
  });
}

function updateFridgeItemStatus(itemId, status) {
  fridgeItems = fridgeItems.map((item) => {
    if (item.id !== itemId) {
      return item;
    }
    if (status === "available") {
      const { statusChangedAt, ...rest } = item;
      return { ...rest, status };
    }
    return { ...item, status, statusChangedAt: new Date().toISOString() };
  });
  renderFridge();
  saveState();
  scheduleFridgeCleanup();
}

function renderShoppingList() {
  elements.shoppingList.replaceChildren();
  elements.shoppingCount.textContent = `${shoppingList.length}개`;

  if (shoppingList.length === 0) {
    elements.shoppingList.append(
      createElement("p", "empty-state", "다음에 필요한 품목을 미리 담아두세요."),
    );
    return;
  }

  shoppingList.forEach((item) => {
    const row = createElement("div", "shopping-item");
    row.append(createElement("span", "shopping-item-name", item.name));
    const removeButton = createElement("button", "delete-expense", "×");
    removeButton.type = "button";
    removeButton.setAttribute("aria-label", `${item.name} 장보기 목록에서 삭제`);
    removeButton.addEventListener("click", () => {
      shoppingList = shoppingList.filter((entry) => entry.id !== item.id);
      renderShoppingList();
      saveState();
    });
    row.append(removeButton);
    elements.shoppingList.append(row);
  });
}

function render() {
  renderMemberEditor();
  renderParticipantControls();
  renderSettlement();
  renderExpenses();
  renderGroceryDrafts();
  renderFridge();
  renderShoppingList();
}

elements.memberList.addEventListener("input", (event) => {
  if (!(event.target instanceof HTMLInputElement)) {
    return;
  }
  members = Array.from(
    elements.memberList.querySelectorAll('input[type="text"]'),
    (input) => input.value.trim(),
  );
  renderParticipantControls();

  const rosterError = getRosterError();
  if (rosterError) {
    showNotice(rosterError);
    return;
  }
  showNotice("");
  renderSettlement();
  saveState();
});

elements.addMember.addEventListener("click", () => {
  if (members.length >= 4 || expenses.length > 0) {
    return;
  }

  let suffix = 1;
  let name = `룸메이트 ${suffix}`;
  while (members.includes(name)) {
    suffix += 1;
    name = `룸메이트 ${suffix}`;
  }
  members = [...members, name];
  render();
  saveState();
});

elements.addGroceryItem.addEventListener("click", () => {
  const name = elements.groceryName.value.trim();
  if (name === "") {
    showNotice("냉장고에 추가할 식품 이름을 입력해 주세요.");
    elements.groceryName.focus();
    return;
  }

  groceryDraftItems = [
    ...groceryDraftItems,
    {
      name,
      expirationDate: elements.groceryExpiration.value,
      storageType: elements.groceryStorageType.value,
      category: "",
    },
  ];
  elements.groceryName.value = "";
  elements.groceryExpiration.value = "";
  showNotice("");
  renderGroceryDrafts();
  elements.groceryName.focus();
});

elements.form.addEventListener("submit", (event) => {
  event.preventDefault();
  const rosterError = getRosterError();
  if (rosterError) {
    showNotice(rosterError);
    return;
  }

  const title = elements.expenseName.value.trim();
  const amount = Number(elements.expenseAmount.value);
  const payer = elements.payer.value;
  const participants = Array.from(
    elements.splitParticipants.querySelectorAll('input[name="split"]:checked'),
    (checkbox) => checkbox.value,
  );

  if (title === "") {
    showNotice("지출 내용을 입력해 주세요.");
    elements.expenseName.focus();
    return;
  }
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    showNotice("금액은 1원 이상의 정수로 입력해 주세요.");
    elements.expenseAmount.focus();
    return;
  }
  if (participants.length === 0) {
    showNotice("부담할 사람을 한 명 이상 선택해 주세요.");
    return;
  }

  try {
    calculateShares(amount, participants, payer);
    const expenseId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const createdAt = new Date().toISOString();
    expenses = [
      ...expenses,
      {
        id: expenseId,
        title,
        amount,
        payer,
        participants,
        groceryItems: groceryDraftItems.map((item) => item.name),
        createdAt,
      },
    ];
    fridgeItems = [
      ...fridgeItems,
      ...groceryDraftItems.map((item) => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        ...item,
        storageType: item.storageType ?? "refrigerated",
        purchasedAt: createdAt,
        expenseId,
        status: "available",
      })),
    ];
    if (groceryDraftItems.length > 0) {
      const purchasedNames = new Set(
        groceryDraftItems.map((item) => item.name.trim().toLocaleLowerCase("ko-KR")),
      );
      shoppingList = shoppingList.filter(
        (item) => !purchasedNames.has(item.name.trim().toLocaleLowerCase("ko-KR")),
      );
    }
  } catch (error) {
    showNotice(error.message);
    return;
  }

  elements.form.reset();
  groceryDraftItems = [];
  showNotice("");
  render();
  saveState();
});

elements.shoppingForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = elements.shoppingItemName.value.trim();
  if (!name) {
    showNotice("장보기 목록에 추가할 품목을 입력해 주세요.");
    return;
  }
  if (!addToShoppingList(name)) {
    showNotice("이미 장보기 목록에 있는 품목입니다.");
    return;
  }
  elements.shoppingItemName.value = "";
  showNotice("");
  renderShoppingList();
  saveState();
});

elements.clearExpenses.addEventListener("click", () => {
  if (expenses.length === 0 || !window.confirm("모든 지출 기록을 삭제할까요?")) {
    return;
  }
  expenses = [];
  settledExpenseIds = [];
  completedTransfers = [];
  render();
  saveState();
});

const expiredFridgeItemsRemoved = removeExpiredFridgeItems();
render();
scheduleFridgeCleanup();
if (expiredFridgeItemsRemoved) {
  saveState();
}
