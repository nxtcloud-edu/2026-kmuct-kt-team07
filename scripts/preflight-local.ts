import assert from "node:assert/strict";
import { writeFile, readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
if (!process.argv.includes("--run"))
  throw new Error("로컬 컨테이너 기동 후 --run으로 실행하세요.");
const container = process.argv
  .find((a) => a.startsWith("--container="))
  ?.slice(12);
if (!container || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(container))
  throw new Error("검증할 로컬 컨테이너 이름을 --container=로 지정하세요.");
const exec = promisify(execFile);
// Inspect only immutable identity fields; container environments may contain secrets.
const identity = (
  await exec("docker", ["inspect", "--format", "{{.Image}}", container])
).stdout.trim();
const platform = (
  await exec("docker", [
    "image",
    "inspect",
    "--format",
    "{{.Os}}/{{.Architecture}}",
    identity,
  ])
).stdout.trim();
const base = "http://127.0.0.1:3014",
  origin = "https://parts-preflight.example";
const expected = JSON.parse(await readFile("data/catalog.json", "utf8"))
  .products.length;
const health = await fetch(base + "/api/health");
assert.equal(health.status, 200);
const page = await fetch(base + "/");
assert.equal(page.status, 200);
const html = await page.text();
const assetPaths = [
  ...new Set(
    [...html.matchAll(/(?:src|href)=["'](\/(?!\/)[^"']+)["']/g)].map(
      (m) => m[1]!,
    ),
  ),
];
assert.ok(assetPaths.some((p) => p.endsWith(".js")));
for (const path of assetPaths) {
  const asset = await fetch(base + path);
  assert.equal(asset.status, 200, path);
  assert.ok(!asset.headers.get("content-type")?.includes("text/html"), path);
  await asset.body?.cancel();
}
const response = await fetch(base + "/api/session");
const cookie = response.headers.get("set-cookie");
assert.ok(cookie);
assert.match(cookie, /Secure/);
assert.match(cookie, /HttpOnly/);
assert.match(cookie, /SameSite=Strict/i);
assert.match(
  response.headers.get("content-security-policy") ?? "",
  /connect-src 'self'/,
);
assert.ok(response.headers.get("strict-transport-security"));
const { csrf } = await response.json();
const headers = {
  cookie: cookie.split(";")[0]!,
  origin,
  "x-csrf-token": csrf,
  "content-type": "application/json",
};
const catalog = await (await fetch(base + "/api/catalog", { headers })).json();
assert.equal(catalog.counts.products, expected);
const create = await fetch(base + "/api/requests", {
  method: "POST",
  headers,
  body: JSON.stringify({
    query: "AX34A5310WWD",
    group: "electronics",
    category: "filter",
  }),
});
assert.equal(create.status, 201);
const record = await create.json();
const selected = await fetch(base + "/api/requests/" + record.id + "/select", {
  method: "POST",
  headers: { ...headers, "if-match": String(record.revision) },
  body: JSON.stringify({
    variantId: "samsung-ax34a5310wwd",
    category: "filter",
  }),
});
assert.equal(selected.status, 200);
const result = await selected.json();
assert.equal(result.paths.cards[0].part.partId, "samsung-cfx-g100d");
const wrong = await fetch(base + "/api/requests", {
  method: "POST",
  headers: { ...headers, origin: "https://untrusted.example" },
  body: "{}",
});
assert.equal(wrong.status, 403);
const unauth = await fetch(base + "/api/requests/" + record.id);
assert.equal(unauth.status, 401);
const publicPaths = [];
for (const path of [
  "/.env",
  "/.data/parts.sqlite",
  "/data/catalog.json",
  "/artifacts/real-photo-evaluation/report.json",
]) {
  const r = await fetch(base + path);
  const body = await r.text();
  assert.ok(r.status === 404 || body.includes("<!doctype html>"));
  assert.ok(!body.includes("AI_API_KEY=") && !body.startsWith("SQLite format"));
  publicPaths.push({ path, notExposed: true });
}
await writeFile(
  "artifacts/production-preflight.json",
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      imageId: identity,
      platform,
      externalDeployment: false,
      checks: {
        health: true,
        secureHttpOnlySameSiteCookie: true,
        csp: true,
        hsts: true,
        csrf: true,
        ownership: true,
        sqliteCreateReadUpdate: true,
        catalogCount: expected,
        productToPurchasePath: true,
        publicAssets: assetPaths,
        privatePaths: publicPaths,
      },
      limits: [
        "Local HTTP transport used only to inspect production headers; public HTTPS/DNS not deployed.",
        "Live AI tested separately using the configured gateway; no credentials passed to this container.",
      ],
    },
    null,
    2,
  ) + "\n",
);
console.log("production preflight passed");
