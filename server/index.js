import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
import { createStore } from "./store.js";

const dataFile = process.env.DATA_FILE || fileURLToPath(new URL("../data/state.json", import.meta.url));
const port = Number(process.env.PORT) || 3000;

const store = await createStore(dataFile);
// LLM 연결은 LLM 담당이 만들어서 여기에 넣는다. 예: const llm = createLlmClient();
const llm = null;
const app = createApp({ store, llm });

app.listen(port, () => {
  console.log(`모아씀 서버: http://localhost:${port}`);
  console.log(`데이터 파일: ${dataFile}`);
});
