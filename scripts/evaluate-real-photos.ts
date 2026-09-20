import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import {
  GatewayObservationProvider,
  parseGatewayObservation,
  type GatewayCallDiagnostic,
} from "../src/gateway.js";
import { observationSchema } from "../src/observation.js";
import { normalizeImage } from "../server/images.js";
import { loadCatalog } from "../server/catalog.js";
import { categories } from "../shared/domain.js";

if (!process.argv.includes("--live"))
  throw new Error("실제 API 호출은 --live로 명시하세요.");
const dir = "artifacts/real-photo-evaluation";
const sources = JSON.parse(await readFile(`${dir}/sources.json`, "utf8"));
const catalog = loadCatalog();
// Ground truth was reviewed from image pixels before any API calls. A product
// page title/URL is not visible evidence and must never reach the observer.
const cases = [
  {
    id: "brake",
    expected: [],
    brand: "SHIMANO",
    note: "Brand visible; BR-MT200 absent.",
  },
  {
    id: "cutter",
    expected: [],
    brand: "OLFA",
    note: "Brand visible; PL-1 absent.",
  },
  {
    id: "eraser",
    expected: [],
    brand: "Tombow",
    note: "MONO zero visible; EH-KUR and round/rectangular variant not written.",
  },
  {
    id: "bookcase",
    expected: [],
    brand: "",
    note: "No brand, model or dimensions printed.",
  },
  {
    id: "remote",
    expected: [],
    brand: "",
    note: "No brand or model code visible.",
  },
  {
    id: "cutter-package",
    expected: ["olfa-pl-1"],
    brand: "OLFA",
    note: "OLFA and PL-1 printed on package.",
  },
  {
    id: "cutter-back",
    expected: [],
    brand: "OLFA",
    note: "Brand and sticker codes visible, but PL-1 absent.",
  },
];
const reports = [];
const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7);
for (const fixture of cases) {
  if (only && fixture.id !== only) continue;
  const bytes = await normalizeImage(
    await readFile(`${dir}/${fixture.id}.image`),
    "full",
  );
  const calls: GatewayCallDiagnostic[] = [];
  const validationIssues: unknown[] = [];
  const provider = new GatewayObservationProvider(
    {
      baseUrl: process.env.AI_API_BASE_URL ?? "",
      apiKey: process.env.AI_API_KEY ?? "",
      model: process.env.AI_MODEL ?? "",
    },
    async (url, init) => {
      const response = await fetch(url, init);
      if (response.ok) {
        const checked = observationSchema.safeParse(
          parseGatewayObservation(await response.clone().json()),
        );
        if (!checked.success)
          validationIssues.push(
            checked.error.issues.map((i) => ({
              code: i.code,
              path: i.path,
              message: i.message,
            })),
          );
      }
      return response;
    },
    (d) => calls.push(d),
  );
  const result = await provider.analyze(
    {
      images: [{ imageId: "image-1", role: "full", format: "jpeg", bytes }],
      allowedCategoryKeys: Object.keys(categories),
    },
    catalog.products,
  );
  const ids = "candidateVariantIds" in result ? result.candidateVariantIds : [];
  const observed = "observation" in result;
  const brandRead =
    !fixture.brand ||
    (observed &&
      result.observation.extractedTexts.some(
        (t) =>
          t.role === "brand" &&
          t.text.toLowerCase().includes(fixture.brand.toLowerCase()),
      ));
  const passed =
    observed &&
    JSON.stringify([...ids].sort()) === JSON.stringify(fixture.expected) &&
    brandRead;
  reports.push({
    ...fixture,
    source: sources.fixtures.find((s: { id: string }) => s.id === fixture.id),
    normalizedSha256: createHash("sha256").update(bytes).digest("hex"),
    passed,
    brandRead,
    result,
    calls,
    validationIssues,
  });
  console.log(
    JSON.stringify({
      fixture: fixture.id,
      passed,
      brandRead,
      ids,
      reason: "reason" in result ? result.reason : result.status,
    }),
  );
  await writeFile(
    `${dir}/${only ? `${only}-report` : "report"}.json`,
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        scope:
          "Public manufacturer product photographs. Six cases without an exact visible model code and one legible package (or a --only subset). Small functional evaluation; not field accuracy or an improvement percentage.",
        reports,
      },
      null,
      2,
    ) + "\n",
  );
}
process.exitCode = reports.every((r) => r.passed) ? 0 : 1;
