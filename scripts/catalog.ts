import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { catalogSchema } from "../shared/domain.js";
import { loadCatalog } from "../server/catalog.js";

const command = process.argv[2] ?? "validate";
if (command === "import") {
  const path = process.argv[3];
  if (!path)
    throw new Error("사용법: npm run catalog:import -- /path/catalog.json");
  const raw = await readFile(path, "utf8");
  const catalog = catalogSchema.parse(JSON.parse(raw));
  const before = await readFile("data/catalog.json", "utf8");
  const after = JSON.stringify(catalog, null, 2) + "\n";
  const revision = `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
  await mkdir("data/history", { recursive: true });
  await writeFile(
    `data/history/${revision}.json`,
    JSON.stringify(
      {
        at: new Date().toISOString(),
        actor: "local_catalog_operator",
        beforeHash: createHash("sha256").update(before).digest("hex"),
        afterHash: createHash("sha256").update(after).digest("hex"),
        before: JSON.parse(before),
        after: catalog,
      },
      null,
      2,
    ) + "\n",
    { flag: "wx" },
  );
  const pending = `data/.catalog-${revision}.tmp`;
  await writeFile(pending, after, { flag: "wx" });
  await rename(pending, "data/catalog.json");
  console.log(
    `검증 후 가져오기 완료: 제품 ${catalog.products.length}개. 서버를 재시작하면 반영됩니다.`,
  );
} else {
  const catalog = loadCatalog();
  console.log(
    `카탈로그 유효: 제품 ${catalog.products.length}, 부품 ${catalog.parts.length}, 판매 ${catalog.offers.length}, 근거 ${catalog.evidence.length}`,
  );
  if (command === "links") {
    const allowed = new Set([
      "nalgene.com",
      "www.hydroflask.com",
      "www.humangear.com",
      "thermosshop.kr",
      "m.thermosshop.kr",
      "kinto.kr",
      "zojirushi.co.kr",
    ]);
    const sources = [
      ...catalog.products.flatMap((p) => [p.source, p.contact]),
      ...catalog.evidence.map((e) => e.source),
      ...catalog.offers.map((o) => o.source),
      ...catalog.parts.flatMap((p) =>
        p.lifecycleSource ? [p.lifecycleSource] : [],
      ),
    ];
    const urls = [...new Set(sources.map((s) => s.url))];
    const results = [];
    for (const url of urls) {
      if (!allowed.has(new URL(url).hostname))
        throw new Error(
          "링크 검사 도메인은 검수 후 스크립트 허용 목록에 추가하세요.",
        );
      try {
        // No redirects or arbitrary user URLs: a URL check is not compatibility verification.
        const response = await fetch(url, {
          method: "GET",
          redirect: "manual",
          signal: AbortSignal.timeout(15000),
          headers: { "User-Agent": "PartsFinder-LinkCheck/1.0" },
        });
        await response.body?.cancel();
        results.push({
          url,
          status: response.status,
          result: response.ok ? "reachable" : "needs_review",
          checkedAt: new Date().toISOString(),
        });
      } catch {
        results.push({
          url,
          result: "network_error",
          checkedAt: new Date().toISOString(),
        });
      }
    }
    await mkdir("artifacts", { recursive: true });
    await writeFile(
      "artifacts/catalog-links.json",
      JSON.stringify(
        {
          scope: "HTTP access only; content and stock not reverified",
          results,
        },
        null,
        2,
      ) + "\n",
    );
    console.log(
      `HTTP 검사 ${results.length}개 완료. 재확인 필요 ${results.filter((r) => r.result !== "reachable").length}개. artifacts/catalog-links.json 확인.`,
    );
  } else if (command !== "validate")
    throw new Error("지원 명령: validate, import, links");
}
