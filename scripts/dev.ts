import { spawn } from "node:child_process";
const server = spawn(process.execPath, ["--import", "tsx", "server/main.ts"], {
  stdio: "inherit",
  env: { ...process.env, APP_ORIGIN: "http://localhost:5173" },
});
const web = spawn(process.execPath, ["node_modules/vite/bin/vite.js"], {
  stdio: "inherit",
});
let closing = false;
function close() {
  if (closing) return;
  closing = true;
  server.kill("SIGTERM");
  web.kill("SIGTERM");
}
server.on("exit", close);
web.on("exit", close);
process.on("SIGINT", close);
process.on("SIGTERM", close);
