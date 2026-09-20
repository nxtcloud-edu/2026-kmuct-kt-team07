import {
  BedrockRuntimeClient,
  ConverseCommand,
  type ConverseCommandInput,
  type ConverseCommandOutput,
  type ToolSpecification,
} from "@aws-sdk/client-bedrock-runtime";
import { buildSystemPrompt } from "./prompt.js";
import { observationJsonSchema } from "./observation.js";
import type { CatalogVariant } from "./catalog.js";
import {
  analyzeObservation,
  requestSchema,
  type ObservationRequest,
  type AnalysisResult,
} from "./analysis.js";
export type { ObservationRequest, AnalysisResult } from "./analysis.js";

export type ConverseSender = (
  input: ConverseCommandInput,
) => Promise<ConverseCommandOutput>;

export const recordObservationTool: ToolSpecification = {
  name: "record_observation",
  description:
    "사진에서 관찰한 사실을 기록한다. 외형으로 짐작한 브랜드·제품군은 visualHints에만 적는다. 호환 판정을 넣지 않는다.",
  inputSchema: {
    json: observationJsonSchema as NonNullable<
      NonNullable<ToolSpecification["inputSchema"]>["json"]
    >,
  },
};

export function buildConverseInput(
  modelId: string,
  request: ObservationRequest,
  retry = false,
): ConverseCommandInput {
  const validated = requestSchema.parse(request);
  return {
    modelId,
    system: [{ text: buildSystemPrompt(validated.allowedCategoryKeys) }],
    messages: [
      {
        role: "user",
        content: [
          {
            text: "다음 사진을 관찰하세요. 각 사진 앞의 JSON은 사진 ID와 역할을 나타내는 메타데이터입니다.",
          },
          ...validated.images.flatMap((image) => [
            {
              text: JSON.stringify({
                imageId: image.imageId,
                role: image.role,
              }),
            },
            { image: { format: image.format, source: { bytes: image.bytes } } },
          ]),
          ...(retry
            ? [
                {
                  text: "이전 응답이 출력 계약을 충족하지 못했습니다. 스키마를 지켜 record_observation 도구를 정확히 한 번 호출하세요.",
                },
              ]
            : []),
        ],
      },
    ],
    toolConfig: {
      tools: [{ toolSpec: recordObservationTool }],
      toolChoice: { tool: { name: "record_observation" } },
    },
    inferenceConfig: { maxTokens: 4096 },
  };
}

function parseToolObservation(response: ConverseCommandOutput): unknown {
  // Text, reasoning and other content are not interpreted or returned.
  if (
    response.stopReason !== "tool_use" ||
    response.output?.message?.role !== "assistant"
  )
    return;
  const toolUses =
    response.output.message.content?.flatMap((block) =>
      block.toolUse ? [block.toolUse] : [],
    ) ?? [];
  if (toolUses.length !== 1 || toolUses[0]?.name !== "record_observation")
    return;
  return toolUses[0].input;
}

export class BedrockObservationProvider {
  constructor(
    private readonly modelId: string,
    private readonly send: ConverseSender,
  ) {
    if (!modelId.trim()) throw new Error("BEDROCK_MODEL_ID가 필요합니다.");
  }

  async analyze(
    request: ObservationRequest,
    catalog: readonly CatalogVariant[],
  ): Promise<AnalysisResult> {
    return analyzeObservation(request, catalog, async (validated, retry) =>
      parseToolObservation(
        await this.send(buildConverseInput(this.modelId, validated, retry)),
      ),
    );
  }
}

export function createBedrockObservationProvider(config: {
  region: string;
  modelId: string;
  timeoutMs?: number;
}) {
  if (!config.region.trim()) throw new Error("AWS_REGION이 필요합니다.");
  const client = new BedrockRuntimeClient({
    region: config.region,
    maxAttempts: 1,
  });
  const provider = new BedrockObservationProvider(config.modelId, (input) =>
    client.send(new ConverseCommand(input), {
      abortSignal: AbortSignal.timeout(config.timeoutMs ?? 30_000),
    }),
  );
  return { provider, destroy: () => client.destroy() };
}
