import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
import { createStore } from "./store.js";
import { createLlmClient } from "./menu/llm-client.js";

const dataFile = process.env.DATA_FILE || fileURLToPath(new URL("../data/state.json", import.meta.url));
const port = Number(process.env.PORT) || 3000;

const store = await createStore(dataFile);
// 환경변수 설정으로 메뉴 추천 객체를 만들어 앱에 전달
const llm = createLlmClient();
const app = createApp({ store, llm });

app.listen(port, () => {
  console.log(`모아씀 서버: http://localhost:${port}`);
  console.log(`데이터 파일: ${dataFile}`);
});
