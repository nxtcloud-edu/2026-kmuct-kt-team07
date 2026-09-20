import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import {
  BedrockRuntimeClient,
  ConverseCommand,
  type ConverseCommandOutput,
} from "@aws-sdk/client-bedrock-runtime";
import {
  BedrockObservationProvider,
  buildConverseInput,
  observationSchema,
  type ObservationRequest,
} from "../src/index.js";

// This command deliberately uses only the licensed public fixture. Do not log
// or persist arbitrary user photos/OCR through this development smoke test.
const fixtureUrl = new URL(
  "../tests/fixtures/public-water-bottle.jpg",
  import.meta.url,
);
const bytes = new Uint8Array(await readFile(fixtureUrl));
const request: ObservationRequest = {
  images: [{ imageId: "public-full-1", role: "full", format: "jpeg", bytes }],
  // Test catalog taxonomy only; production keys must come from its repository.
  allowedCategoryKeys: ["water_bottle_lid", "water_bottle_gasket"],
};
const region = process.env.AWS_REGION ?? "us-east-1";
const modelId = process.env.BEDROCK_MODEL_ID;
const checkInput = process.argv.includes("--check-input");
if (!checkInput && !modelId) {
  console.error(
    "BEDROCK_MODEL_ID를 설정하세요. 실제 호출을 수행하지 않았습니다.",
  );
  process.exit(2);
}
buildConverseInput(modelId ?? "input-validation-only", request);
const fixture = {
  file: "tests/fixtures/public-water-bottle.jpg",
  source:
    "https://commons.wikimedia.org/wiki/File:Stainless_steel_water_bottle.jpg",
  sha256: createHash("sha256").update(bytes).digest("hex"),
  bytes: bytes.byteLength,
};
if (checkInput) {
  console.log(
    JSON.stringify(
      { inputValid: true, liveCallPerformed: false, fixture, region },
      null,
      2,
    ),
  );
} else {
  const calls: Array<Record<string, unknown>> = [];
  const client = new BedrockRuntimeClient({ region, maxAttempts: 1 });
  const startedAt = new Date().toISOString();
  const start = performance.now();
  const provider = new BedrockObservationProvider(modelId!, async (input) => {
    try {
      const output: ConverseCommandOutput = await client.send(
        new ConverseCommand(input),
        {
          abortSignal: AbortSignal.timeout(30_000),
        },
      );
      const toolUses =
        output.output?.message?.content?.flatMap((block) =>
          block.toolUse ? [block.toolUse] : [],
        ) ?? [];
      const validation = observationSchema.safeParse(toolUses[0]?.input);
      calls.push({
        httpStatus: output.$metadata.httpStatusCode,
        requestId: output.$metadata.requestId,
        stopReason: output.stopReason,
        toolNames: toolUses.map((tool) => tool.name),
        toolCallCount: toolUses.length,
        zodValid: validation.success,
        ...(validation.success
          ? {}
          : {
              schemaErrors: validation.error.issues.map((issue) => ({
                path: issue.path,
                code: issue.code,
              })),
            }),
        usage: output.usage,
        latencyMs: output.metrics?.latencyMs,
      });
      return output;
    } catch (error) {
      const details = error as {
        name?: string;
        $metadata?: { httpStatusCode?: number; requestId?: string };
      };
      calls.push({
        errorName: details.name ?? "UnknownError",
        httpStatus: details.$metadata?.httpStatusCode,
        requestId: details.$metadata?.requestId,
      });
      throw error;
    }
  });
  try {
    const result = await provider.analyze(request, []);
    const passed = "observation" in result;
    const report = {
      startedAt,
      finishedAt: new Date().toISOString(),
      elapsedMs: Math.round(performance.now() - start),
      passed,
      region,
      modelId,
      fixture,
      calls,
      result,
    };
    const directory = new URL("../artifacts/", import.meta.url);
    await mkdir(directory, { recursive: true });
    const reportUrl = new URL(
      `bedrock-smoke-${startedAt.replace(/[:.]/g, "-")}.json`,
      directory,
    );
    await writeFile(reportUrl, JSON.stringify(report, null, 2) + "\n");
    console.log(JSON.stringify(report, null, 2));
    console.log(`Report: ${reportUrl.pathname}`);
    process.exitCode = passed ? 0 : 1;
  } finally {
    client.destroy();
  }
}
