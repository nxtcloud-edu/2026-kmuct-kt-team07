import assert from "node:assert/strict";
import test from "node:test";
import type {
  ConverseCommandInput,
  ConverseCommandOutput,
} from "@aws-sdk/client-bedrock-runtime";
import {
  BedrockObservationProvider,
  buildConverseInput,
  filterObservation,
  matchCatalogModels,
  observationSchema,
  recordObservationTool,
  type Observation,
  type ObservationRequest,
  type CatalogVariant,
} from "../src/index.js";

const request: ObservationRequest = {
  images: [
    {
      imageId: "label-1",
      role: "label",
      format: "png",
      bytes: new Uint8Array([1]),
    },
  ],
  allowedCategoryKeys: ["gasket"],
};
function observation(overrides: Partial<Observation> = {}): Observation {
  return {
    categoryCandidates: [
      {
        categoryKey: "gasket",
        description: "고리 모양",
        imageIds: ["label-1"],
      },
    ],
    extractedTexts: [
      {
        text: " AB-O1S ",
        imageId: "label-1",
        role: "model",
        legibility: "uncertain",
      },
    ],
    observedFeatures: [],
    qualityIssues: [],
    unknownFields: [],
    ...overrides,
  };
}
const catalog: CatalogVariant[] = [
  {
    variantId: "demo-500-v1",
    modelName: "DEMO A",
    aliases: ["ab-015"],
    capacity: "500mL",
    generation: "1세대",
  },
  {
    variantId: "demo-700-v2",
    modelName: "DEMO B",
    aliases: ["AB-OIS"],
    capacity: "700mL",
    generation: "2세대",
  },
];
function response(input: unknown = observation()): ConverseCommandOutput {
  return {
    $metadata: {},
    usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
    metrics: { latencyMs: 1 },
    stopReason: "tool_use",
    output: {
      message: {
        role: "assistant",
        content: [
          { text: "버려야 할 자유 텍스트" },
          {
            toolUse: {
              toolUseId: "call-1",
              name: "record_observation",
              input: input as never,
            },
          },
        ],
      },
    },
  };
}

test("Converse links image IDs/roles to bytes and forces the tool", () => {
  const input = buildConverseInput("configured-model", request);
  assert.deepEqual(input.toolConfig?.toolChoice, {
    tool: { name: "record_observation" },
  });
  assert.equal(
    input.toolConfig?.tools?.[0]?.toolSpec?.name,
    "record_observation",
  );
  assert.match(input.system?.[0]?.text ?? "", /허용 카테고리: \["gasket"\]/);
  assert.doesNotMatch(input.system?.[0]?.text ?? "", /\{\{ALLOWED/);
  assert.equal(
    input.messages?.[0]?.content?.[1]?.text,
    '{"imageId":"label-1","role":"label"}',
  );
  assert.deepEqual(
    input.messages?.[0]?.content?.[2]?.image?.source?.bytes,
    request.images[0]?.bytes,
  );
  const schema = recordObservationTool.inputSchema?.json as Record<
    string,
    unknown
  >;
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(schema.required, [
    "categoryCandidates",
    "extractedTexts",
    "observedFeatures",
    "qualityIssues",
    "unknownFields",
    "visualHints",
    "identifiedProduct",
  ]);
});

test("strict schema rejects extra fields, invalid enums and oversized arrays/text", () => {
  assert.equal(
    observationSchema.safeParse({ ...observation(), compatible: true }).success,
    false,
  );
  assert.equal(
    observationSchema.safeParse(
      observation({ qualityIssues: ["unknown" as never] }),
    ).success,
    false,
  );
  assert.equal(
    observationSchema.safeParse(
      observation({
        categoryCandidates: Array(4).fill(observation().categoryCandidates[0]),
      }),
    ).success,
    false,
  );
  assert.equal(
    observationSchema.safeParse(
      observation({
        extractedTexts: [
          { ...observation().extractedTexts[0]!, text: "a".repeat(61) },
        ],
      }),
    ).success,
    false,
  );
  assert.equal(
    observationSchema.safeParse(
      observation({
        observedFeatures: [
          { key: "other", value: "a", imageId: "label-1", price: 1 } as never,
        ],
      }),
    ).success,
    false,
  );
});

test("filters invalid category keys and every foreign image reference without mutating OCR", () => {
  const raw = observation({
    categoryCandidates: [
      {
        categoryKey: "gasket",
        description: "유효",
        imageIds: ["foreign", "label-1"],
      },
      { categoryKey: "forbidden", description: "제거", imageIds: ["label-1"] },
      {
        categoryKey: "gasket",
        description: "근거 없음",
        imageIds: ["foreign"],
      },
    ],
    extractedTexts: [
      ...observation().extractedTexts,
      { text: "AB015", imageId: "foreign", role: "model", legibility: "clear" },
    ],
    observedFeatures: [
      { key: "ruler_visible", value: "true", imageId: "foreign" },
    ],
  });
  const filtered = filterObservation(raw, request.allowedCategoryKeys, [
    "label-1",
  ]);
  assert.deepEqual(filtered.categoryCandidates, [
    { categoryKey: "gasket", description: "유효", imageIds: ["label-1"] },
  ]);
  assert.equal(filtered.extractedTexts.length, 1);
  assert.equal(filtered.extractedTexts[0]?.text, " AB-O1S ");
  assert.equal(filtered.observedFeatures.length, 0);
  assert.deepEqual(raw.categoryCandidates[0]?.imageIds, ["foreign", "label-1"]);
  assert.deepEqual(filterObservation(raw, [], ["label-1"]).unknownFields, [
    "category",
  ]);
});

test("uncertain OCR compares all combinations and preserves source text", () => {
  const matched = matchCatalogModels(observation(), catalog);
  assert.equal(matched.candidates.length, 2);
  assert.equal(matched.comparisons[0]?.originalText, " AB-O1S ");
  assert.equal(matched.comparisons[0]?.normalizedText, "ABO1S");
});

test("clear OCR normalizes case/spacing/hyphens without ambiguous substitutions", () => {
  const exact = observation({
    extractedTexts: [
      {
        text: " ab — 015 ",
        imageId: "label-1",
        role: "model",
        legibility: "clear",
      },
    ],
  });
  assert.deepEqual(
    matchCatalogModels(exact, catalog).candidates.map((item) => item.variantId),
    ["demo-500-v1"],
  );
});

test("uncertain matching does not grow exponentially or truncate valid aliases", () => {
  const long = observation({
    extractedTexts: [
      {
        text: "O".repeat(60),
        imageId: "label-1",
        role: "model",
        legibility: "uncertain",
      },
    ],
  });
  const matched = matchCatalogModels(long, [
    { ...catalog[0]!, aliases: ["0".repeat(60)] },
  ]);
  assert.equal(matched.candidates.length, 1);
});

test("other text and empty normalized labels cannot identify products", () => {
  const raw = observation({
    extractedTexts: [
      { text: "AB015", imageId: "label-1", role: "other", legibility: "clear" },
      { text: " - ", imageId: "label-1", role: "model", legibility: "clear" },
    ],
  });
  assert.equal(
    matchCatalogModels(raw, [{ ...catalog[0]!, aliases: ["", "AB015"] }])
      .candidates.length,
    0,
  );
});

test("multiple variants require objective choices and never select automatically", async () => {
  const provider = new BedrockObservationProvider("model", async () =>
    response(),
  );
  const result = await provider.analyze(request, catalog);
  assert.equal(result.status, "needs_information");
  assert.ok("reason" in result && result.reason === "ambiguous_model");
  assert.deepEqual(
    result.question.options.map((option) => [
      option.capacity,
      option.generation,
    ]),
    [
      ["500mL", "1세대"],
      ["700mL", "2세대"],
    ],
  );
  assert.equal(result.question.allowUnknown, true);
  assert.equal("selectedVariantId" in result, false);
  assert.equal(JSON.stringify(result).includes("버려야 할 자유 텍스트"), false);
});

test("normalization collisions across variants remain ambiguous even for clear text", async () => {
  const raw = observation({
    extractedTexts: [
      { text: "ab015", imageId: "label-1", role: "model", legibility: "clear" },
    ],
  });
  const provider = new BedrockObservationProvider("model", async () =>
    response(raw),
  );
  const result = await provider.analyze(request, [
    catalog[0]!,
    { ...catalog[1]!, aliases: ["AB-015"] },
  ]);
  assert.ok("reason" in result && result.reason === "ambiguous_model");
});

test("one catalog variant with several matching aliases stays a candidate only", async () => {
  const provider = new BedrockObservationProvider("model", async () =>
    response(),
  );
  const result = await provider.analyze(request, [
    { ...catalog[0]!, aliases: ["ab015", "AB-O1S", "ABOIS"] },
  ]);
  assert.equal(result.status, "observed");
  assert.ok("candidateVariantIds" in result);
  assert.deepEqual(result.candidateVariantIds, ["demo-500-v1"]);
  assert.equal("compatible" in result, false);
});

test("invalid Zod output retries once with a fresh request then succeeds", async () => {
  const calls: ConverseCommandInput[] = [];
  const provider = new BedrockObservationProvider("model", async (input) => {
    calls.push(input);
    return calls.length === 1
      ? response({ ...observation(), price: "bad" })
      : response();
  });
  const result = await provider.analyze(request, [catalog[0]!]);
  assert.equal(result.status, "observed");
  assert.equal(result.attempts, 2);
  assert.equal(calls.length, 2);
  assert.match(
    calls[1]?.messages?.[0]?.content?.at(-1)?.text ?? "",
    /이전 응답/,
  );
  assert.equal(JSON.stringify(calls[1]).includes('"price"'), false);
});

test("two invalid outputs return model search fallback", async () => {
  let calls = 0;
  const provider = new BedrockObservationProvider("model", async () => {
    calls++;
    return response({});
  });
  const result = await provider.analyze(request, catalog);
  assert.equal(calls, 2);
  assert.deepEqual(result, {
    status: "needs_information",
    reason: "invalid_model_output",
    attempts: 2,
    nextAction: { kind: "model_search", label: "모델명으로 찾기" },
  });
});

test("missing, wrong or multiple tool calls, and truncated output are rejected", async () => {
  const validTool = response().output!.message!.content![1]!;
  const outputs: ConverseCommandOutput[] = [
    { ...response(), stopReason: "max_tokens" },
    {
      ...response(),
      output: {
        message: {
          role: "assistant",
          content: [{ text: JSON.stringify(observation()) }],
        },
      },
    },
    {
      ...response(),
      output: {
        message: { role: "assistant", content: [validTool, validTool] },
      },
    },
    {
      ...response(),
      output: {
        message: {
          role: "assistant",
          content: [{ toolUse: { ...validTool.toolUse!, name: "wrong" } }],
        },
      },
    },
  ];
  for (const output of outputs) {
    const result = await new BedrockObservationProvider(
      "model",
      async () => output,
    ).analyze(request, catalog);
    assert.ok("reason" in result && result.reason === "invalid_model_output");
    assert.equal(result.attempts, 2);
  }
});

test("foreign image OCR cannot produce a catalog candidate", async () => {
  const raw = observation({
    extractedTexts: [
      { text: "AB015", role: "model", imageId: "foreign", legibility: "clear" },
    ],
  });
  const result = await new BedrockObservationProvider("model", async () =>
    response(raw),
  ).analyze(request, catalog);
  assert.ok("reason" in result && result.reason === "model_not_found");
  assert.equal(result.attempts, 1);
});

test("provider errors fall back without exposing errors or repeatedly billing", async () => {
  let calls = 0;
  const result = await new BedrockObservationProvider("model", async () => {
    calls++;
    throw new Error("private provider details");
  }).analyze(request, catalog);
  assert.equal(calls, 1);
  assert.ok("reason" in result && result.reason === "provider_error");
  assert.equal(JSON.stringify(result).includes("private"), false);
});

test("invalid local input never calls Bedrock", async () => {
  let calls = 0;
  const provider = new BedrockObservationProvider("model", async () => {
    calls++;
    return response();
  });
  await assert.rejects(
    provider.analyze(
      { ...request, images: [request.images[0]!, request.images[0]!] },
      catalog,
    ),
  );
  await assert.rejects(provider.analyze({ ...request, images: [] }, catalog));
  await assert.rejects(
    provider.analyze(
      {
        ...request,
        images: [{ ...request.images[0]!, bytes: new Uint8Array(3_750_001) }],
      },
      catalog,
    ),
  );
  assert.equal(calls, 0);
});
