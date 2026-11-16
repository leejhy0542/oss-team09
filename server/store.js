// JSON 파일 저장소. 쓰기는 한 번에 하나씩, 임시 파일에 쓴 뒤 이름을 바꿔 파일이 깨지지 않게 한다.
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export function createDefaultState() {
  return {
    members: ["나", "룸메이트 1"],
    expenses: [],
    settledExpenseIds: [],
    completedTransfers: [],
    fridgeItems: [],
    shoppingList: [],
  };
}

// filePath가 없으면 메모리에만 저장한다 (테스트용).
export async function createStore(filePath) {
  let state = createDefaultState();
  if (filePath) {
    try {
      state = { ...createDefaultState(), ...JSON.parse(await readFile(filePath, "utf8")) };
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }

  let queue = Promise.resolve();

  return {
    get: () => structuredClone(state),
    // updater가 새 상태를 돌려주면 저장한다. 에러를 던지면 아무것도 바뀌지 않는다.
    update(updater) {
      const run = queue.then(async () => {
        const next = updater(structuredClone(state));
        if (filePath) {
          await mkdir(dirname(filePath), { recursive: true });
          const tmp = `${filePath}.tmp`;
          await writeFile(tmp, JSON.stringify(next, null, 2));
          await rename(tmp, filePath);
        }
        state = next;
        return structuredClone(state);
      });
      queue = run.catch(() => {});
      return run;
    },
  };
}
