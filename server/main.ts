import { createApp } from "./app.js";
import { loadCatalog } from "./catalog.js";
import { Store } from "./store.js";
import { createGatewayObservationProvider } from "../src/gateway.js";

const production = process.env.NODE_ENV === "production";
const port = Number(process.env.PORT ?? 3001);
const origin =
  process.env.APP_ORIGIN ?? (production ? "" : `http://localhost:${port}`);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("PORT 설정을 확인하세요.");
if (!origin || (production && new URL(origin).protocol !== "https:"))
  throw new Error("배포 환경에는 HTTPS APP_ORIGIN 설정이 필요합니다.");
if (
  new URL(origin).origin !== origin ||
  !["http:", "https:"].includes(new URL(origin).protocol)
)
  throw new Error(
    "APP_ORIGIN에는 경로·쿼리·인증 정보·끝 슬래시 없는 Origin이 필요합니다.",
  );
const dailyLimit = Number(process.env.AI_DAILY_REQUEST_LIMIT ?? 100);
if (!Number.isInteger(dailyLimit) || dailyLimit < 1 || dailyLimit > 10000)
  throw new Error("AI_DAILY_REQUEST_LIMIT 설정을 확인하세요.");
const catalog = loadCatalog();
const store = new Store(process.env.DATABASE_PATH ?? ".data/parts.sqlite");
let provider: ReturnType<typeof createGatewayObservationProvider> | undefined;
if (
  process.env.AI_API_KEY ||
  process.env.AI_API_BASE_URL ||
  process.env.AI_MODEL
)
  provider = createGatewayObservationProvider();
const service = createApp({
  store,
  catalog,
  origin,
  production,
  dailyLimit,
  analyze: provider
    ? (request) => provider!.analyze(request, catalog.products)
    : undefined,
});
const server = service.app.listen(port, process.env.HOST ?? "127.0.0.1", () =>
  console.log(
    `딱품: ${origin} · 사진 분석 ${provider ? "연결됨" : "미설정"}`,
  ),
);
server.requestTimeout = 30000;
server.headersTimeout = 15000;
let closing = false;
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, async () => {
    if (closing) return;
    closing = true;
    server.close();
    await service.stop();
    store.close();
    process.exit(0);
  });
