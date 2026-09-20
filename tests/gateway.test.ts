import assert from "node:assert/strict";
import test from "node:test";
import {
  GatewayObservationProvider,
  buildGatewayInput,
  parseGatewayObservation,
} from "../src/gateway.js";
import type { ObservationRequest } from "../src/analysis.js";

const config = {
  baseUrl: "https://gateway.example/v1/",
  apiKey: "test-secret",
  model: "configured-model",
};
const request: ObservationRequest = {
  images: [
    {
      imageId: "full-1",
      role: "full",
      format: "jpeg",
      bytes: new Uint8Array([1, 2, 3]),
    },
  ],
  allowedCategoryKeys: ["lid"],
};
const observation = {
  categoryCandidates: [
    { categoryKey: "lid", description: "뚜껑", imageIds: ["full-1"] },
  ],
  extractedTexts: [],
  observedFeatures: [],
  qualityIssues: ["label_missing"],
  unknownFields: ["model"],
};
function completion(args: unknown = observation) {
  return {
    choices: [
      {
        finish_reason: "tool_calls",
        message: {
          role: "assistant",
          content: "이 텍스트를 사용하지 마세요.",
          tool_calls: [
            {
              type: "function",
              function: {
                name: "record_observation",
                arguments: JSON.stringify(args),
              },
            },
          ],
        },
      },
    ],
    usage: { prompt_tokens: 123, completion_tokens: 45 },
  };
}

test("gateway sends image bytes with roles and forces exactly the observation function", async () => {
  const diagnostics: unknown[] = [];
  const fetcher: typeof fetch = async (url, options) => {
    assert.equal(url, "https://gateway.example/v1/chat/completions");
    assert.equal(options?.redirect, "error");
    assert.equal(
      (options?.headers as Record<string, string>).Authorization,
      "Bearer test-secret",
    );
    const body = JSON.parse(options?.body as string);
    assert.deepEqual(body.tool_choice, {
      type: "function",
      function: { name: "record_observation" },
    });
    assert.equal(body.parallel_tool_calls, false);
    assert.equal(body.model, config.model);
    assert.equal(
      body.messages[1].content[1].text,
      '{"imageId":"full-1","role":"full"}',
    );
    assert.equal(
      body.messages[1].content[2].image_url.url,
      "data:image/jpeg;base64,AQID",
    );
    assert.equal(body.tools[0].function.parameters.additionalProperties, false);
    return Response.json(completion());
  };
  const provider = new GatewayObservationProvider(config, fetcher, (value) =>
    diagnostics.push(value),
  );
  const result = await provider.analyze(request, []);
  assert.ok("observation" in result);
  assert.deepEqual(result.observation, observation);
  assert.ok("reason" in result && result.reason === "model_not_found");
  assert.equal(result.attempts, 1);
  assert.equal(JSON.stringify(result).includes("이 텍스트"), false);
  const log = JSON.stringify(diagnostics);
  for (const secret of ["test-secret", "AQID", "뚜껑"])
    assert.equal(log.includes(secret), false);
  assert.match(log, /"promptTokens":123/);
});

test("rejects truncated, multiple, wrong, text-only and non-JSON tool output", () => {
  const good = completion();
  const choice = good.choices[0]!;
  for (const value of [
    { choices: [{ ...choice, finish_reason: "length" }] },
    { choices: [choice, choice] },
    {
      choices: [
        {
          ...choice,
          message: {
            ...choice.message,
            tool_calls: [
              ...choice.message.tool_calls,
              ...choice.message.tool_calls,
            ],
          },
        },
      ],
    },
    {
      choices: [
        {
          ...choice,
          message: { role: "assistant", content: JSON.stringify(observation) },
        },
      ],
    },
    {
      choices: [
        {
          ...choice,
          message: {
            ...choice.message,
            tool_calls: [
              {
                type: "function",
                function: { name: "wrong", arguments: "{}" },
              },
            ],
          },
        },
      ],
    },
    {
      choices: [
        {
          ...choice,
          message: {
            ...choice.message,
            tool_calls: [
              {
                type: "function",
                function: { name: "record_observation", arguments: "{" },
              },
            ],
          },
        },
      ],
    },
  ])
    assert.equal(parseGatewayObservation(value), undefined);
});

test("invalid response retries once without including rejected output", async () => {
  let calls = 0;
  const provider = new GatewayObservationProvider(
    config,
    async (_url, options) => {
      calls++;
      if (calls === 1)
        return Response.json(
          completion({ ...observation, forbiddenField: true }),
        );
      const body = JSON.parse(options?.body as string);
      assert.match(body.messages[1].content.at(-1).text, /이전 응답/);
      assert.equal((options?.body as string).includes("forbiddenField"), false);
      return Response.json(completion());
    },
  );
  const result = await provider.analyze(request, []);
  assert.ok("observation" in result);
  assert.equal(result.attempts, 2);
  assert.equal(calls, 2);
});

test("two invalid HTTP JSON bodies use the model-search fallback", async () => {
  let calls = 0;
  const result = await new GatewayObservationProvider(config, async () => {
    calls++;
    return new Response("not JSON");
  }).analyze(request, []);
  assert.equal(calls, 2);
  assert.ok("reason" in result && result.reason === "invalid_model_output");
});

test("authentication, rate limits, upstream failure and redirects never auto-retry", async () => {
  for (const status of [302, 401, 403, 429, 500]) {
    let calls = 0;
    const result = await new GatewayObservationProvider(config, async () => {
      calls++;
      return new Response("private error details", { status });
    }).analyze(request, []);
    assert.equal(calls, 1);
    assert.ok("reason" in result && result.reason === "provider_error");
    assert.equal(JSON.stringify(result).includes("private"), false);
  }
});

test("timeouts are sanitized and monitoring failures cannot cause retries", async () => {
  const diagnostics: unknown[] = [];
  const failed = await new GatewayObservationProvider(
    config,
    async () => {
      throw new DOMException("private", "TimeoutError");
    },
    (value) => diagnostics.push(value),
  ).analyze(request, []);
  assert.ok("reason" in failed && failed.reason === "provider_error");
  assert.match(JSON.stringify(diagnostics), /"error":"timeout"/);
  let calls = 0;
  const passed = await new GatewayObservationProvider(
    config,
    async () => {
      calls++;
      return Response.json(completion());
    },
    () => {
      throw new Error("monitor down");
    },
  ).analyze(request, []);
  assert.ok("observation" in passed);
  assert.equal(calls, 1);
});

test("insecure or credential-bearing URLs are rejected without revealing secrets", () => {
  for (const baseUrl of [
    "http://gateway.example/v1",
    "https://user:test-secret@gateway.example",
    "https://gateway.example?key=test-secret",
    "https://gateway.example#secret",
  ]) {
    assert.throws(
      () => new GatewayObservationProvider({ ...config, baseUrl }),
      (error) =>
        error instanceof Error && !error.message.includes("test-secret"),
    );
  }
});

test("bad request data does not call the gateway", async () => {
  let calls = 0;
  const provider = new GatewayObservationProvider(config, async () => {
    calls++;
    return Response.json(completion());
  });
  await assert.rejects(provider.analyze({ ...request, images: [] }, []));
  assert.equal(calls, 0);
  assert.throws(() =>
    buildGatewayInput(config.model, {
      ...request,
      images: [request.images[0]!, request.images[0]!],
    }),
  );
});
