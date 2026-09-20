import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  configurationIssues,
  publicAssetIssues,
} from "../scripts/release-policy.js";

const valid = {
  NODE_ENV: "production",
  APP_ORIGIN: "https://parts.demo.kr",
  AI_API_BASE_URL: "https://gateway.demo.kr/v1",
  AI_API_KEY: "test-only-secret",
  AI_MODEL: "vision-model",
  AI_DAILY_REQUEST_LIMIT: "100",
  DATABASE_PATH: "/app/.data/parts.sqlite",
};
test("release gate rejects unsafe or incomplete deployment settings without printing values", () => {
  assert.deepEqual(configurationIssues(valid), []);
  for (const patch of [
    { NODE_ENV: "development" },
    { APP_ORIGIN: "http://parts.demo.kr" },
    { APP_ORIGIN: "https://parts.demo.kr/path" },
    { APP_ORIGIN: "https://parts-preflight.example" },
    { APP_ORIGIN: "https://parts.example.com" },
    { APP_ORIGIN: "https://example.org" },
    { APP_ORIGIN: "https://parts.invalid" },
    { AI_API_BASE_URL: "https://private-user:private-pass@gateway.demo.kr/v1" },
    { AI_API_KEY: "" },
    { AI_MODEL: "" },
    { AI_DAILY_REQUEST_LIMIT: "" },
    { DATABASE_PATH: ":memory:" },
    { NODE_TLS_REJECT_UNAUTHORIZED: "0" },
  ]) {
    const issues = configurationIssues({ ...valid, ...patch });
    assert.ok(issues.length);
    assert.ok(!JSON.stringify(issues).includes("private-pass"));
    assert.ok(!JSON.stringify(issues).includes(valid.AI_API_KEY));
  }
});
test("public build scan rejects leaked configured secrets and private files without returning their contents", async () => {
  const directory = await mkdtemp(join(tmpdir(), "parts-release-"));
  try {
    await writeFile(join(directory, "index.html"), "<!doctype html>");
    assert.deepEqual(await publicAssetIssues(directory, valid), []);
    await writeFile(join(directory, "app.js"), valid.AI_API_KEY);
    await writeFile(join(directory, ".env"), "private settings");
    const issues = await publicAssetIssues(directory, valid);
    assert.equal(issues.length, 2);
    assert.ok(!JSON.stringify(issues).includes(valid.AI_API_KEY));
    assert.ok(!JSON.stringify(issues).includes("private settings"));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
