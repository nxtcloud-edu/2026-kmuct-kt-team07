import test from "node:test";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { ApiError, fetchJson, pollSerial } from "../client/network.js";

test("slow or failed mutation is bounded and never resubmitted automatically", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async (_url, init) => {
    calls++;
    await new Promise((_, reject) =>
      init?.signal?.addEventListener(
        "abort",
        () => reject(new Error("aborted")),
        { once: true },
      ),
    );
    return Response.json({});
  };
  await assert.rejects(
    fetchJson(
      "/api/requests",
      { method: "POST", headers: { "idempotency-key": "same-key" } },
      { fetcher, timeoutMs: 5 },
    ),
    /최근 찾기/,
  );
  assert.equal(calls, 1);
});

test("proxy HTML failures are friendly and retain status for terminal errors", async () => {
  await assert.rejects(
    fetchJson(
      "/api/requests/id",
      {},
      {
        fetcher: async () =>
          new Response("<html>proxy stack</html>", { status: 503 }),
      },
    ),
    (e) =>
      e instanceof ApiError &&
      e.status === 503 &&
      !e.message.includes("proxy stack"),
  );
  await assert.rejects(
    fetchJson(
      "/api/requests/id",
      {},
      {
        fetcher: async () =>
          Response.json({ error: "찾기 기록이 없습니다." }, { status: 404 }),
      },
    ),
    (e) => e instanceof ApiError && e.status === 404,
  );
});

test("polling remains serial on slow reads and stops when ready", async () => {
  let active = 0,
    maxActive = 0,
    calls = 0;
  let done!: () => void;
  const completion = new Promise<void>((resolve) => (done = resolve));
  const stop = pollSerial(
    async () => {
      calls++;
      active++;
      maxActive = Math.max(maxActive, active);
      await delay(12);
      active--;
      return calls;
    },
    (value) => {
      if (value === 3) {
        done();
        return false;
      }
      return true;
    },
    () => true,
    1,
  );
  await completion;
  await delay(20);
  stop();
  assert.equal(calls, 3);
  assert.equal(maxActive, 1);
});

test("poll cleanup aborts pending read and ignores a stale response", async () => {
  let entered!: () => void, finish!: () => void;
  const started = new Promise<void>((r) => (entered = r));
  const pending = new Promise<void>((r) => (finish = r));
  let signal: AbortSignal | undefined,
    callbacks = 0;
  const stop = pollSerial(
    async (s) => {
      signal = s;
      entered();
      await pending;
      return 1;
    },
    () => {
      callbacks++;
      return true;
    },
    () => {
      callbacks++;
      return true;
    },
    1,
  );
  await started;
  stop();
  assert.equal(signal?.aborted, true);
  finish();
  await delay(10);
  assert.equal(callbacks, 0);
});

test("transient read failure recovers without submitting another analysis", async () => {
  let reads = 0,
    failures = 0;
  let done!: () => void;
  const completed = new Promise<void>((r) => (done = r));
  const stop = pollSerial(
    async () => {
      if (++reads === 1) throw new Error("offline");
      return "ready";
    },
    () => {
      done();
      return false;
    },
    () => {
      failures++;
      return true;
    },
    1,
  );
  await completed;
  stop();
  assert.equal(reads, 2);
  assert.equal(failures, 1);
});
