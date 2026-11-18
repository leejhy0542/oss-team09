// 프론트에서 서버 API를 부르는 함수 모음. script.js에서 import해서 localStorage 대신 쓴다.
async function request(method, path, body) {
  const response = await fetch(`/api${path}`, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? `요청 실패 (${response.status})`);
  return data;
}

export const api = {
  getState: () => request("GET", "/state"),
  setMembers: (members) => request("PUT", "/members", { members }),
  addExpenseCategory: (category) => request("POST", "/categories", { category }),

  addExpense: (expense) => request("POST", "/expenses", expense),
  deleteExpense: (id) => request("DELETE", `/expenses/${encodeURIComponent(id)}`),
  clearExpenses: () => request("DELETE", "/expenses"),

  getSettlement: () => request("GET", "/settlement"),
  completeTransfer: (transfer) => request("POST", "/transfers", transfer),

  getFridge: () => request("GET", "/fridge"),
  addFridgeItem: (item) => request("POST", "/fridge", item),
  addFridgeItems: (items) => request("POST", "/fridge", { items }),
  setFridgeStatus: (id, status) => request("PATCH", `/fridge/${encodeURIComponent(id)}`, { status }),
  setFridgeOwner: (id, owner) => request("PATCH", `/fridge/${encodeURIComponent(id)}`, { owner }),
  getFridgeStats: () => request("GET", "/fridge/stats"),
  getMenuSuggestion: () => request("POST", "/fridge/menu-suggestion"),

  getShoppingList: () => request("GET", "/shopping-list"),
  addShoppingItem: (name) => request("POST", "/shopping-list", { name }),
  deleteShoppingItem: (id) => request("DELETE", `/shopping-list/${encodeURIComponent(id)}`),
};
