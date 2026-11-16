// Express 앱. store와 llm을 밖에서 넣어 주므로 테스트에서 가짜로 바꿔 끼울 수 있다.
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import express from "express";
import { calculateMinimumTransfers } from "../Calcul.js";
import {
  calculateBalances,
  getExpiryStatus,
  isFridgeItemVisible,
  normalizeName,
  todayInSeoul,
} from "./rules.js";
import {
  HttpError,
  validateExpense,
  validateGroceryItem,
  validateMembers,
  validateTransfer,
} from "./validate.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
// 화면 파일만 공개한다. 저장소 전체를 static으로 열면 data/나 .env가 노출된다.
const PUBLIC_FILES = ["index.html", "style.css", "script.js", "Calcul.js", "api.js"];
const FRIDGE_STATUSES = ["available", "consumed", "discarded"];
const EXPIRY_ORDER = { expired: 0, soon: 1, fresh: 2, unknown: 3 };

function getSettlement(state) {
  const balances = calculateBalances(state);
  return {
    balances,
    transfers: calculateMinimumTransfers(balances),
    completedTransfers: state.completedTransfers,
  };
}

function withExpiry(items, now) {
  const today = todayInSeoul(now);
  return items
    .filter((item) => isFridgeItemVisible(item, now))
    .map((item) => ({ ...item, expiry: getExpiryStatus(item.expirationDate, today) }))
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === "available" ? -1 : b.status === "available" ? 1 : 0;
      return (
        EXPIRY_ORDER[a.expiry.status] - EXPIRY_ORDER[b.expiry.status] ||
        a.expirationDate.localeCompare(b.expirationDate)
      );
    });
}

export function createApp({ store, llm, now = () => new Date() }) {
  const app = express();
  app.use(express.json({ limit: "100kb" }));

  for (const file of PUBLIC_FILES) {
    app.get(`/${file}`, (req, res) => res.sendFile(file, { root: ROOT }));
  }
  app.get("/", (req, res) => res.sendFile("index.html", { root: ROOT }));

  const api = express.Router();

  // 첫 화면을 그릴 때 한 번에 받는 전체 상태
  api.get("/state", (req, res) => {
    const state = store.get();
    res.json({
      ...state,
      fridgeItems: withExpiry(state.fridgeItems, now()),
      settlement: getSettlement(state),
    });
  });

  // 멤버
  api.get("/members", (req, res) => res.json(store.get().members));
  api.put("/members", async (req, res) => {
    const members = validateMembers(req.body?.members);
    const state = await store.update((s) => {
      if (s.expenses.length > 0) throw new HttpError(409, "지출 기록이 있으면 멤버를 바꿀 수 없습니다.");
      return { ...s, members };
    });
    res.json(state.members);
  });

  // 지출 (장보기 기록)
  api.get("/expenses", (req, res) => res.json(store.get().expenses));

  api.post("/expenses", async (req, res) => {
    let created;
    await store.update((s) => {
      const input = validateExpense(req.body, s.members);
      const createdAt = now().toISOString();
      created = {
        id: randomUUID(),
        title: input.title,
        amount: input.amount,
        payer: input.payer,
        participants: input.participants,
        groceryItems: input.groceryItems.map((item) => item.name),
        createdAt,
      };
      const newFridgeItems = input.groceryItems.map((item) => ({
        id: randomUUID(),
        ...item,
        purchasedAt: createdAt,
        expenseId: created.id,
        status: "available",
      }));
      // 산 식품과 같은 이름은 다음 장보기 목록에서 지운다
      const bought = new Set(input.groceryItems.map((item) => normalizeName(item.name)));
      return {
        ...s,
        expenses: [...s.expenses, created],
        fridgeItems: [...s.fridgeItems, ...newFridgeItems],
        shoppingList: s.shoppingList.filter((item) => !bought.has(normalizeName(item.name))),
      };
    });
    res.status(201).json(created);
  });

  api.delete("/expenses/:id", async (req, res) => {
    await store.update((s) => {
      if (!s.expenses.some((e) => e.id === req.params.id)) throw new HttpError(404, "지출을 찾을 수 없습니다.");
      return {
        ...s,
        expenses: s.expenses.filter((e) => e.id !== req.params.id),
        settledExpenseIds: s.settledExpenseIds.filter((id) => id !== req.params.id),
      };
    });
    res.status(204).end();
  });

  // 지출 전체 삭제. 냉장고 재고는 그대로 둔다.
  api.delete("/expenses", async (req, res) => {
    await store.update((s) => ({ ...s, expenses: [], settledExpenseIds: [], completedTransfers: [] }));
    res.status(204).end();
  });

  // 정산
  api.get("/settlement", (req, res) => res.json(getSettlement(store.get())));

  // 송금 완료. 현재 정산 결과에 있는 송금과 정확히 일치해야 한다.
  api.post("/transfers", async (req, res) => {
    const transfer = validateTransfer(req.body);
    let completed;
    const state = await store.update((s) => {
      const pending = calculateMinimumTransfers(calculateBalances(s));
      const match = pending.some(
        (t) => t.from === transfer.from && t.to === transfer.to && t.amount === transfer.amount,
      );
      if (!match) throw new HttpError(409, "현재 정산 결과에 없는 송금입니다. 화면을 새로고침해 주세요.");
      completed = { id: randomUUID(), ...transfer, completedAt: now().toISOString() };
      return { ...s, completedTransfers: [...s.completedTransfers, completed] };
    });
    res.status(201).json({ completed, settlement: getSettlement(state) });
  });

  // 냉장고
  api.get("/fridge", (req, res) => {
    res.json(withExpiry(store.get().fridgeItems, now()));
  });

  // 장보기 없이 식품만 직접 등록
  api.post("/fridge", async (req, res) => {
    const item = validateGroceryItem(req.body);
    const created = {
      id: randomUUID(),
      ...item,
      purchasedAt: now().toISOString(),
      expenseId: "",
      status: "available",
    };
    await store.update((s) => ({ ...s, fridgeItems: [...s.fridgeItems, created] }));
    res.status(201).json(created);
  });

  api.patch("/fridge/:id", async (req, res) => {
    const { status } = req.body ?? {};
    if (!FRIDGE_STATUSES.includes(status)) {
      throw new HttpError(400, "상태는 available, consumed, discarded 중 하나여야 합니다.");
    }
    let updated;
    await store.update((s) => {
      const item = s.fridgeItems.find((i) => i.id === req.params.id);
      if (!item) throw new HttpError(404, "식품을 찾을 수 없습니다.");
      // 다 먹음·폐기로 바꾸면 바꾼 시각을 남기고, 보관 중으로 되돌리면(취소) 지운다
      const { statusChangedAt, ...rest } = item;
      updated = status === "available" ? { ...rest, status } : { ...rest, status, statusChangedAt: now().toISOString() };
      return { ...s, fridgeItems: s.fridgeItems.map((i) => (i.id === item.id ? updated : i)) };
    });
    res.json(updated);
  });

  // 임박 식품으로 한 줄 메뉴 제안 (LLM 자리).
  // LLM 담당이 만들 객체 모양: { enabled: true, suggestMenu: async (식품이름배열) => "한 줄 메뉴" 또는 null }
  // llm이 없거나 실패하면 200으로 suggestion: null을 줘서 나머지 기능은 그대로 동작한다.
  api.post("/fridge/menu-suggestion", async (req, res) => {
    const today = todayInSeoul(now());
    const soonItems = store
      .get()
      .fridgeItems.filter((i) => i.status === "available" && getExpiryStatus(i.expirationDate, today).status === "soon")
      .map((i) => i.name);
    if (soonItems.length === 0) return res.json({ items: [], suggestion: null, reason: "no-items" });
    if (!llm?.enabled) return res.json({ items: soonItems, suggestion: null, reason: "llm-disabled" });
    const suggestion = await llm.suggestMenu(soonItems);
    res.json({ items: soonItems, suggestion, reason: suggestion ? "ok" : "llm-failed" });
  });

  // 다음 장보기 목록
  api.get("/shopping-list", (req, res) => res.json(store.get().shoppingList));

  api.post("/shopping-list", async (req, res) => {
    const name = req.body?.name;
    if (typeof name !== "string" || name.trim() === "" || name.trim().length > 50) {
      throw new HttpError(400, "품목 이름은 1~50자로 입력해 주세요.");
    }
    const created = { id: randomUUID(), name: name.trim() };
    await store.update((s) => {
      if (s.shoppingList.some((i) => normalizeName(i.name) === normalizeName(name))) {
        throw new HttpError(409, "이미 장보기 목록에 있는 품목입니다.");
      }
      return { ...s, shoppingList: [...s.shoppingList, created] };
    });
    res.status(201).json(created);
  });

  api.delete("/shopping-list/:id", async (req, res) => {
    await store.update((s) => {
      if (!s.shoppingList.some((i) => i.id === req.params.id)) throw new HttpError(404, "품목을 찾을 수 없습니다.");
      return { ...s, shoppingList: s.shoppingList.filter((i) => i.id !== req.params.id) };
    });
    res.status(204).end();
  });

  app.use("/api", api);
  app.use("/api", (req, res) => res.status(404).json({ error: "없는 API입니다." }));

  // 에러는 모두 { error: 메시지 } 형태로 돌려준다
  app.use((error, req, res, next) => {
    if (error instanceof HttpError) return res.status(error.status).json({ error: error.message });
    if (error.type === "entity.parse.failed") return res.status(400).json({ error: "JSON 형식이 올바르지 않습니다." });
    if (error instanceof RangeError || error instanceof TypeError) {
      return res.status(400).json({ error: error.message });
    }
    console.error(error);
    res.status(500).json({ error: "서버 오류가 발생했습니다." });
  });

  return app;
}
