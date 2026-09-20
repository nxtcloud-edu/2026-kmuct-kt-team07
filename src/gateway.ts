import { z } from "zod";
import {
  analyzeObservation,
  requestSchema,
  type ObservationRequest,
  type AnalysisResult,
} from "./analysis.js";
import type { CatalogVariant } from "./catalog.js";
import { observationJsonSchema } from "./observation.js";
import { buildSystemPrompt } from "./prompt.js";

const configSchema = z.object({
  baseUrl: z
    .string()
    .url()
    .refine((value) => {
      const url = new URL(value);
      return (
        url.protocol === "https:" &&
        !url.username &&
        !url.password &&
        !url.search &&
        !url.hash
      );
    }, "AI_API_BASE_URL에는 인증 정보나 쿼리 없는 HTTPS 주소가 필요합니다."),
  apiKey: z.string().trim().min(1),
  model: z.string().trim().min(1),
  timeoutMs: z.number().int().min(1).max(120_000).default(60_000),
});
export type GatewayConfig = z.input<typeof configSchema>;

export function buildGatewayInput(
  model: string,
  request: ObservationRequest,
  retry = false,
) {
  const validated = requestSchema.parse(request);
  return {
    model,
    messages: [
      {
        role: "system",
        content: buildSystemPrompt(validated.allowedCategoryKeys),
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "다음 사진을 관찰하세요. 각 사진 앞의 JSON은 사진 ID와 역할을 나타내는 메타데이터입니다.",
          },
          ...validated.images.flatMap((image) => [
            {
              type: "text",
              text: JSON.stringify({
                imageId: image.imageId,
                role: image.role,
              }),
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/${image.format};base64,${Buffer.from(image.bytes).toString("base64")}`,
              },
            },
          ]),
          ...(retry
            ? [
                {
                  type: "text",
                  text: "이전 응답이 출력 계약을 충족하지 못했습니다. extractedTexts는 브랜드·모델 코드·용량을 우선해 최대 12개, 각 text는 최대 60자로 제한하세요. categoryCandidates 각 항목에는 imageIds 배열이 필수입니다. observedFeatures는 최대 10개입니다. 필수 필드와 enum을 지켜 record_observation 도구를 정확히 한 번 호출하세요.",
                },
              ]
            : []),
        ],
      },
    ],
    tools: [
      {
        type: "function",
        function: {
          name: "record_observation",
          description:
            "사진에서 관찰한 사실을 기록한다. 외형으로 짐작한 브랜드·제품군은 visualHints에만 적는다. 호환 판정을 넣지 않는다.",
          parameters: observationJsonSchema,
        },
      },
    ],
    tool_choice: { type: "function", function: { name: "record_observation" } },
    parallel_tool_calls: false,
    max_completion_tokens: 4096,
    stream: false,
  };
}

const completionSchema = z.object({
  choices: z
    .array(
      z.object({
        finish_reason: z.literal("tool_calls"),
        message: z.object({
          role: z.literal("assistant"),
          tool_calls: z
            .array(
              z.object({
                type: z.literal("function"),
                function: z.object({
                  name: z.literal("record_observation"),
                  arguments: z.string(),
                }),
              }),
            )
            .length(1),
        }),
      }),
    )
    .length(1),
});

export function parseGatewayObservation(response: unknown): unknown {
  const parsed = completionSchema.safeParse(response);
  if (!parsed.success) return;
  try {
    return JSON.parse(
      parsed.data.choices[0]!.message.tool_calls[0]!.function.arguments,
    );
  } catch {
    return;
  }
}

/** Diagnostic metadata deliberately excludes keys, messages, images and OCR. */
export interface GatewayCallDiagnostic {
  httpStatus?: number;
  elapsedMs: number;
  error?: "http_error" | "network_error" | "timeout" | "invalid_json";
  toolCallCount?: number;
  promptTokens?: number;
  completionTokens?: number;
}
const metadataSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({ tool_calls: z.array(z.unknown()).optional() }),
      }),
    )
    .optional(),
  usage: z
    .object({
      prompt_tokens: z.number().optional(),
      completion_tokens: z.number().optional(),
    })
    .optional(),
});

export class GatewayObservationProvider {
  readonly #config: z.output<typeof configSchema>;
  constructor(
    config: GatewayConfig,
    private readonly fetcher: typeof fetch = fetch,
    private readonly onCall?: (diagnostic: GatewayCallDiagnostic) => void,
  ) {
    // Do not let validation errors include submitted configuration values.
    const parsed = configSchema.safeParse(config);
    if (!parsed.success)
      throw new Error(
        "AI_API_BASE_URL, AI_API_KEY, AI_MODEL과 timeoutMs 설정을 확인하세요.",
      );
    this.#config = parsed.data;
  }

  async analyze(
    request: ObservationRequest,
    catalog: readonly CatalogVariant[],
  ): Promise<AnalysisResult> {
    return analyzeObservation(request, catalog, async (validated, retry) => {
      const start = performance.now();
      const diagnostic: GatewayCallDiagnostic = { elapsedMs: 0 };
      try {
        const response = await this.fetcher(
          `${this.#config.baseUrl.replace(/\/+$/, "")}/chat/completions`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${this.#config.apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(
              buildGatewayInput(this.#config.model, validated, retry),
            ),
            redirect: "error",
            signal: AbortSignal.timeout(this.#config.timeoutMs),
          },
        );
        diagnostic.httpStatus = response.status;
        if (!response.ok) {
          diagnostic.error = "http_error";
          await response.body?.cancel();
          throw new Error("Gateway request failed");
        }
        let body: unknown;
        try {
          body = await response.json();
        } catch (error) {
          if (
            error instanceof Error &&
            ["TimeoutError", "AbortError"].includes(error.name)
          )
            throw error;
          diagnostic.error = "invalid_json";
          return undefined;
        }
        const meta = metadataSchema.safeParse(body);
        if (meta.success) {
          diagnostic.toolCallCount =
            meta.data.choices?.[0]?.message.tool_calls?.length ?? 0;
          diagnostic.promptTokens = meta.data.usage?.prompt_tokens;
          diagnostic.completionTokens = meta.data.usage?.completion_tokens;
        }
        return parseGatewayObservation(body);
      } catch (error) {
        diagnostic.error ??=
          error instanceof Error &&
          ["TimeoutError", "AbortError"].includes(error.name)
            ? "timeout"
            : "network_error";
        throw new Error("Gateway unavailable");
      } finally {
        diagnostic.elapsedMs = Math.round(performance.now() - start);
        // Monitoring failures must never trigger another billable inference.
        try {
          this.onCall?.(diagnostic);
        } catch {
          /* no-op */
        }
      }
    });
  }
}

export function createGatewayObservationProvider(
  env: NodeJS.ProcessEnv = process.env,
) {
  return new GatewayObservationProvider({
    baseUrl: env.AI_API_BASE_URL ?? "",
    apiKey: env.AI_API_KEY ?? "",
    model: env.AI_MODEL ?? "",
  });
}

/**
 * A plain text call to the same gateway, for work that has no tool contract —
 * reading a part number out of fetched web pages. The observation path keeps
 * its strict schema; this one only ever returns the model's text.
 */
export function createGatewayTextAsker(env: NodeJS.ProcessEnv = process.env) {
  const config = configSchema.parse({
    baseUrl: env.AI_API_BASE_URL ?? "",
    apiKey: env.AI_API_KEY ?? "",
    model: env.AI_MODEL ?? "",
  });
  return async (system: string, user: string): Promise<string> => {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
      signal: AbortSignal.timeout(config.timeoutMs ?? 60_000),
    });
    if (!response.ok) throw new Error(`gateway ${response.status}`);
    const body = (await response.json()) as {
      choices?: { message?: { content?: unknown } }[];
    };
    const content = body.choices?.[0]?.message?.content;
    return typeof content === "string" ? content : "";
  };
}
