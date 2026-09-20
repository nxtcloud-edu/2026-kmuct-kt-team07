import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";

if (!process.argv.includes("--run"))
  throw new Error("로컬 Docker 검증은 --run으로 실행하세요.");
const image = process.argv.find((a) => a.startsWith("--image="))?.slice(8);
if (!image || image.startsWith("-") || /\s/.test(image))
  throw new Error("--image=로컬이미지태그 필요");
const exec = promisify(execFile);
const docker = async (...args: string[]) =>
  (await exec("docker", args, { timeout: 180000 })).stdout.trim();
const id = randomUUID().slice(0, 8);
const container = `parts-restart-${id}`,
  volume = `parts-restart-data-${id}`;
const base = "http://127.0.0.1:3015",
  origin = "https://parts-restart.example";
let volumeCreated = false,
  containerCreated = false;
try {
  const imageId = await docker(
    "image",
    "inspect",
    image,
    "--format",
    "{{.Id}}",
  );
  await docker("volume", "create", volume);
  volumeCreated = true;
  async function launch() {
    await docker(
      "run",
      "--pull=never",
      "-d",
      "--name",
      container,
      "-p",
      "127.0.0.1:3015:3001",
      "-e",
      `APP_ORIGIN=${origin}`,
      "-v",
      `${volume}:/app/.data`,
      image!,
    );
    containerCreated = true;
    for (let i = 0; i < 30; i++) {
      try {
        if (
          (
            await fetch(base + "/api/health", {
              signal: AbortSignal.timeout(1000),
            })
          ).ok
        )
          return;
      } catch {}
      await delay(500);
    }
    throw new Error("로컬 컨테이너 준비 시간 초과");
  }
  await launch();
  const session = await fetch(base + "/api/session");
  const cookie = session.headers.get("set-cookie");
  assert.ok(cookie);
  const { csrf } = await session.json();
  const headers = {
    cookie: cookie.split(";")[0]!,
    origin,
    "x-csrf-token": csrf,
    "content-type": "application/json",
    "idempotency-key": randomUUID(),
  };
  const body = JSON.stringify({
    query: "AX34A5310WWD",
    group: "electronics",
    category: "filter",
  });
  const created = await fetch(base + "/api/requests", {
    method: "POST",
    headers,
    body,
  });
  assert.equal(created.status, 201);
  const record = await created.json();
  await docker("stop", "--time", "150", container);
  await docker("rm", container);
  containerCreated = false;
  await launch();
  const recovered = await fetch(base + "/api/requests/" + record.id, {
    headers,
  });
  assert.equal(recovered.status, 200);
  const recoveredRecord = await recovered.json();
  assert.equal(recoveredRecord.id, record.id);
  assert.equal(recoveredRecord.query, "AX34A5310WWD");
  const repeated = await fetch(base + "/api/requests", {
    method: "POST",
    headers,
    body,
  });
  assert.ok(repeated.ok);
  assert.equal((await repeated.json()).id, record.id);
  assert.equal((await fetch(base + "/api/requests/" + record.id)).status, 401);
  await mkdir("artifacts", { recursive: true });
  await writeFile(
    "artifacts/restart-verification.json",
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        passed: true,
        imageId,
        externalDeployment: false,
        checks: {
          containerRecreated: true,
          sqliteVolumePersisted: true,
          sessionPersisted: true,
          requestPersisted: true,
          idempotencyPersisted: true,
          ownershipStillEnforced: true,
        },
        limits: [
          "Same image recreated with a disposable volume; not a cross-schema downgrade test.",
          "No user database, private photo, API credentials, or paid API call used.",
        ],
      },
      null,
      2,
    ) + "\n",
  );
  console.log("컨테이너 교체 후 DB·세션·중복 방지·소유권 검사 통과");
} finally {
  if (containerCreated) {
    await docker("stop", "--time", "150", container);
    await docker("rm", container);
  }
  if (volumeCreated) await docker("volume", "rm", volume);
}
