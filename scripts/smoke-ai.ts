import { readFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import {
  GatewayObservationProvider,
  type GatewayCallDiagnostic,
} from "../src/gateway.js";

const bytes = new Uint8Array(
  await readFile(
    new URL("../tests/fixtures/public-water-bottle.jpg", import.meta.url),
  ),
);
const calls: GatewayCallDiagnostic[] = [];
const provider = new GatewayObservationProvider(
  {
    baseUrl: process.env.AI_API_BASE_URL ?? "",
    apiKey: process.env.AI_API_KEY ?? "",
    model: process.env.AI_MODEL ?? "",
  },
  fetch,
  (diagnostic) => calls.push(diagnostic),
);
const startedAt = new Date().toISOString();
const result = await provider.analyze(
  {
    images: [{ imageId: "public-full-1", role: "full", format: "jpeg", bytes }],
    allowedCategoryKeys: ["water_bottle_lid", "water_bottle_gasket"],
  },
  [],
);
const passed = "observation" in result;
const report = {
  startedAt,
  finishedAt: new Date().toISOString(),
  passed,
  model: process.env.AI_MODEL,
  fixture: {
    file: "tests/fixtures/public-water-bottle.jpg",
    sha256: createHash("sha256").update(bytes).digest("hex"),
    source:
      "https://commons.wikimedia.org/wiki/File:Stainless_steel_water_bottle.jpg",
  },
  calls,
  result,
};
const directory = new URL("../artifacts/", import.meta.url);
await mkdir(directory, { recursive: true });
const output = new URL(
  `ai-smoke-${startedAt.replace(/[:.]/g, "-")}.json`,
  directory,
);
await writeFile(output, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
console.log(`Report: ${fileURLToPath(output)}`);
process.exitCode = passed ? 0 : 1;
