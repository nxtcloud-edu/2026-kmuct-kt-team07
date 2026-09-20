import { z } from "zod";
import {
  filterObservation,
  observationSchema,
  type Observation,
} from "./observation.js";
import {
  buildVariantQuestion,
  hasIdentityConflict,
  matchCatalogModels,
  type CatalogVariant,
  type ModelComparison,
} from "./catalog.js";

const imageSchema = z.strictObject({
  imageId: z.string().min(1).max(128),
  role: z.enum(["full", "part", "label"]),
  format: z.enum(["jpeg", "png", "webp"]),
  bytes: z
    .instanceof(Uint8Array)
    .refine(
      (bytes) => bytes.byteLength > 0 && bytes.byteLength <= 3_750_000,
      "정규화된 사진은 0바이트 초과, 3.75MB 이하여야 합니다.",
    ),
});
export const requestSchema = z.strictObject({
  images: z
    .array(imageSchema)
    .min(1)
    .max(4)
    .refine(
      (images) =>
        new Set(images.map((image) => image.imageId)).size === images.length,
      "사진 ID 중복",
    ),
  allowedCategoryKeys: z.array(z.string().min(1).max(128)).max(100),
});

export type ObservationRequest = z.infer<typeof requestSchema>;
const fallback = { kind: "model_search" as const, label: "모델명으로 찾기" };
type ObservedData = {
  observation: Observation;
  modelComparisons: ModelComparison[];
  candidateVariantIds: string[];
  attempts: number;
};
export type AnalysisResult =
  | (ObservedData & { status: "observed" })
  | (ObservedData & {
      status: "needs_information";
      reason: "ambiguous_model";
      question: ReturnType<typeof buildVariantQuestion>;
      nextAction: typeof fallback;
    })
  | (ObservedData & {
      status: "needs_information";
      reason: "model_not_found" | "conflicting_identity";
      nextAction: typeof fallback;
    })
  | {
      status: "needs_information";
      reason: "invalid_model_output" | "provider_error";
      attempts: number;
      nextAction: typeof fallback;
    };

export async function analyzeObservation(
  request: ObservationRequest,
  catalog: readonly CatalogVariant[],
  send: (request: ObservationRequest, retry: boolean) => Promise<unknown>,
): Promise<AnalysisResult> {
  const validated = requestSchema.parse(request);
  for (let attempt = 1; attempt <= 2; attempt++) {
    let raw: unknown;
    try {
      raw = await send(validated, attempt === 2);
    } catch {
      return {
        status: "needs_information",
        reason: "provider_error",
        attempts: attempt,
        nextAction: fallback,
      };
    }
    const parsed = observationSchema.safeParse(raw);
    if (!parsed.success) continue;
    const observation = filterObservation(
      parsed.data,
      validated.allowedCategoryKeys,
      validated.images.map((image) => image.imageId),
    );
    const { comparisons, candidates } = matchCatalogModels(
      observation,
      catalog,
    );
    const data: ObservedData = {
      observation,
      modelComparisons: comparisons,
      candidateVariantIds: candidates.map((candidate) => candidate.variantId),
      attempts: attempt,
    };
    if (hasIdentityConflict(observation, candidates))
      return {
        ...data,
        status: "needs_information",
        reason: "conflicting_identity",
        nextAction: fallback,
      };
    if (candidates.length > 1)
      return {
        ...data,
        status: "needs_information",
        reason: "ambiguous_model",
        question: buildVariantQuestion(candidates),
        nextAction: fallback,
      };
    if (candidates.length === 0)
      return {
        ...data,
        status: "needs_information",
        reason: "model_not_found",
        nextAction: fallback,
      };
    return { ...data, status: "observed" };
  }
  return {
    status: "needs_information",
    reason: "invalid_model_output",
    attempts: 2,
    nextAction: fallback,
  };
}
