import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
import {
  GatewayObservationProvider,
  type GatewayCallDiagnostic,
} from "../src/gateway.js";
import { normalizeImage } from "../server/images.js";
import { loadCatalog } from "../server/catalog.js";
import { categories } from "../shared/domain.js";

if (!process.argv.includes("--live"))
  throw new Error("실제 API 호출은 --live로 명시하세요.");
const catalog = loadCatalog();
const dir = "artifacts/daily-label-evaluation";
await mkdir(dir, { recursive: true });
const reports = [];
for (const fixture of [
  {
    id: "purifier-label",
    brand: "DYSON",
    model: "TP04",
    expected: ["dyson-tp04"],
  },
  {
    id: "brake-label",
    brand: "SHIMANO",
    model: "BR-MT200",
    expected: ["shimano-br-mt200"],
  },
  {
    id: "ambiguous-bookcase-label",
    brand: "IKEA",
    model: "BILLY",
    expected: catalog.products
      .filter((p) => p.variantId.startsWith("ikea-billy-"))
      .map((p) => p.variantId),
  },
]) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000"><rect width="1600" height="1000" fill="white"/><g font-family="Arial" fill="black"><text x="100" y="200" font-size="50">SYNTHETIC TEST LABEL</text><text x="100" y="480" font-size="120">${fixture.brand}</text><text x="100" y="700" font-size="110">${fixture.model}</text></g></svg>`;
  const bytes = await normalizeImage(
    await sharp(Buffer.from(svg)).jpeg().toBuffer(),
    "label",
  );
  await writeFile(`${dir}/${fixture.id}.jpg`, bytes);
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
      allowedCategoryKeys: Object.keys(categories),
    },
    catalog.products,
  );
  const ids = "candidateVariantIds" in result ? result.candidateVariantIds : [];
  const passed =
    JSON.stringify([...ids].sort()) ===
      JSON.stringify([...fixture.expected].sort()) &&
    (fixture.expected.length < 2 ||
      (result.status === "needs_information" &&
        result.reason === "ambiguous_model"));
  reports.push({ fixture: fixture.id, synthetic: true, passed, result, calls });
  console.log(JSON.stringify({ fixture: fixture.id, passed, ids }));
}
await writeFile(
  `${dir}/report.json`,
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      scope:
        "Three synthetic label contract checks; not real object photo accuracy or a benchmark",
      reports,
    },
    null,
    2,
  ) + "\n",
);
process.exitCode = reports.every((r) => r.passed) ? 0 : 1;
