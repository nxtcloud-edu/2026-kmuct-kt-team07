import sharp from "sharp";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import {
  GatewayObservationProvider,
  type GatewayCallDiagnostic,
} from "../src/gateway.js";
import { normalizeImage } from "../server/images.js";
import { loadCatalog } from "../server/catalog.js";
import { photoHints } from "../server/photo-hints.js";

if (!process.argv.includes("--live"))
  throw new Error("실제 AI 호출은 --live 옵션으로 실행하세요.");
const dir = "artifacts/photo-evaluation";
await mkdir(dir, { recursive: true });
const catalog = loadCatalog();
const fixtures = [
  {
    id: "synthetic-model-label",
    brand: "THERMOS",
    model: "JNL-505K",
    capacity: "500 mL",
    expected: "thermos-jnl-505k",
  },
  {
    id: "synthetic-brand-capacity",
    brand: "KINTO",
    model: "",
    capacity: "500 mL",
    expected: "",
  },
];
const reports = [];
for (const f of fixtures) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="2800" height="2000"><rect width="100%" height="100%" fill="#f2f0e9"/><rect x="350" y="350" width="2100" height="1300" fill="white" stroke="#aaa" stroke-width="4"/><g font-family="Arial" fill="#222"><text x="500" y="600" font-size="64">SYNTHETIC TEST LABEL</text><text x="500" y="900" font-size="180">${f.brand}</text><text x="500" y="1120" font-size="110">${f.model}</text><text x="500" y="1350" font-size="100">${f.capacity}</text></g></svg>`;
  await writeFile(`${dir}/${f.id}.svg`, svg);
  const bytes = await normalizeImage(
    await sharp(Buffer.from(svg)).jpeg().toBuffer(),
    "label",
  );
  await writeFile(`${dir}/${f.id}.jpg`, bytes);
  const calls: GatewayCallDiagnostic[] = [];
  const provider = new GatewayObservationProvider(
    {
      baseUrl: process.env.AI_API_BASE_URL ?? "",
      apiKey: process.env.AI_API_KEY ?? "",
      model: process.env.AI_MODEL ?? "",
    },
    fetch,
    (d) => calls.push(d),
  );
  const result = await provider.analyze(
    {
      images: [{ imageId: "label", role: "label", format: "jpeg", bytes }],
      allowedCategoryKeys: ["lid", "gasket", "straw", "handle"],
    },
    catalog.products,
  );
  const observation = "observation" in result ? result.observation : undefined;
  const hints = photoHints(observation, catalog.products);
  const ids = "candidateVariantIds" in result ? result.candidateVariantIds : [];
  const passed =
    !!observation &&
    (f.expected
      ? ids.length === 1 && ids[0] === f.expected
      : ids.length === 0 &&
        hints.products.some((p) => p.variantId === "kinto-water-bottle-500"));
  reports.push({
    fixture: f.id,
    synthetic: true,
    passed,
    result,
    hintIds: hints.products.map((p) => p.variantId),
    calls,
  });
  console.log(
    JSON.stringify({
      fixture: f.id,
      passed,
      candidateIds: ids,
      hintIds: hints.products.map((p) => p.variantId),
    }),
  );
}
const calls: GatewayCallDiagnostic[] = [];
const provider = new GatewayObservationProvider(
  {
    baseUrl: process.env.AI_API_BASE_URL ?? "",
    apiKey: process.env.AI_API_KEY ?? "",
    model: process.env.AI_MODEL ?? "",
  },
  fetch,
  (d) => calls.push(d),
);
const bytes = await normalizeImage(
  await readFile("tests/fixtures/public-water-bottle.jpg"),
);
const result = await provider.analyze(
  {
    images: [{ imageId: "full", role: "full", format: "jpeg", bytes }],
    allowedCategoryKeys: ["lid", "gasket", "straw", "handle"],
  },
  catalog.products,
);
const passed =
  "candidateVariantIds" in result && result.candidateVariantIds.length === 0;
reports.push({
  fixture: "public-water-bottle-no-model",
  synthetic: false,
  passed,
  result,
  hintIds: [],
  calls,
});
console.log(
  JSON.stringify({ fixture: "public-water-bottle-no-model", passed }),
);
await writeFile(
  `${dir}/report.json`,
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      scope:
        "2 synthetic labels and 1 public bottle photo; smoke checks, not real-world accuracy or before/after benchmark",
      reports,
    },
    null,
    2,
  ) + "\n",
);
process.exitCode = reports.every((r) => r.passed) ? 0 : 1;
