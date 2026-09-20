import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { configurationIssues, publicAssetIssues } from "./release-policy.js";
import { loadCatalog } from "../server/catalog.js";

const issues = configurationIssues(process.env);
try {
  await access("dist/index.html");
  await access("dist-server/server/main.js");
  issues.push(...(await publicAssetIssues("dist", process.env)));
} catch {
  issues.push("서버·웹 빌드 검사 실패: npm run build 후 확인하세요.");
}
let catalogSummary: object | undefined;
try {
  const catalog = loadCatalog();
  catalogSummary = {
    sha256: createHash("sha256")
      .update(await readFile("data/catalog.json"))
      .digest("hex"),
    products: catalog.products.length,
    parts: catalog.parts.length,
    offers: catalog.offers.length,
    evidence: catalog.evidence.length,
  };
} catch {
  issues.push("카탈로그 검증 실패: npm run catalog:validate로 확인하세요.");
}
const report = {
  checkedAt: new Date().toISOString(),
  passed: issues.length === 0,
  issues,
  catalog: catalogSummary,
  externalDeployment: false,
  scope:
    "Local configuration and build checks only; no API request, DNS, TLS connection, payment, or deployment performed.",
};
await mkdir("artifacts", { recursive: true });
await writeFile(
  "artifacts/release-readiness.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(
  report.passed
    ? "배포 설정·빌드 검사 통과"
    : "배포 설정 검사: 아직 준비할 항목이 있습니다.",
);
for (const issue of issues) console.log(`- ${issue}`);
console.log(
  "결과: artifacts/release-readiness.json (환경 변수 값은 저장하지 않음)",
);
process.exitCode = report.passed ? 0 : 1;
