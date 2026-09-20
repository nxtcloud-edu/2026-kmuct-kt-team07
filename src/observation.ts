import { z } from "zod";

export const observationSchema = z.strictObject({
  categoryCandidates: z
    .array(
      z.strictObject({
        categoryKey: z.string(),
        description: z.string().max(120),
        imageIds: z.array(z.string()),
      }),
    )
    .max(3),
  extractedTexts: z
    .array(
      z.strictObject({
        text: z.string().max(60),
        imageId: z.string(),
        role: z.enum(["brand", "model", "capacity", "other"]),
        legibility: z.enum(["clear", "uncertain"]),
      }),
    )
    .max(12),
  observedFeatures: z
    .array(
      z.strictObject({
        key: z.enum([
          "product_type",
          "appearance",
          "lid_connection",
          "lid_type",
          "gasket_cross_section",
          "has_straw",
          "has_handle",
          "ruler_visible",
          "other",
        ]),
        value: z.string().max(60),
        imageId: z.string(),
      }),
    )
    .max(10),
  qualityIssues: z.array(
    z.enum([
      "blurry",
      "glare",
      "subject_too_small",
      "label_cropped",
      "label_missing",
      "personal_info_visible",
      "other",
    ]),
  ),
  unknownFields: z.array(
    z.enum([
      "category",
      "brand",
      "model",
      "capacity",
      "generation",
      "lid_connection",
    ]),
  ),
  /**
   * Guesses from design alone, kept apart from what was read or seen. They only
   * order recommendations; they never identify a product. Older records and
   * retries may lack the field, so validation tolerates its absence.
   */
  visualHints: z
    .strictObject({
      suspectedBrands: z.array(z.string().max(40)).max(3),
      productFamilyHints: z.array(z.string().max(60)).max(3),
      appearance: z.array(z.string().max(60)).max(5),
    })
    .optional(),
  /**
   * The product the observer recognises in the photo, named from its own
   * knowledge rather than from the catalog. This is what the user asked for:
   * the thing in their photo, not a registered product that resembles it.
   * It is an estimate the user confirms, never a verified identity, so it
   * carries its own confidence and says what the estimate rests on.
   * Older records lack the field, so validation tolerates its absence.
   */
  identifiedProduct: z
    .strictObject({
      brand: z.string().max(40),
      modelName: z.string().max(60),
      productName: z.string().max(80),
      confidence: z.enum(["high", "medium", "low"]),
      basis: z.enum(["label_text", "design_only", "both"]),
    })
    .nullable()
    .optional(),
});

export type Observation = z.infer<typeof observationSchema>;

// A single source of truth keeps the Bedrock contract and Zod validation aligned.
export const observationJsonSchema = z.toJSONSchema(observationSchema, {
  target: "draft-07",
});
delete observationJsonSchema.$schema;
// The contract asks every new observation for its guesses, even when empty.
(observationJsonSchema.required as string[]).push(
  "visualHints",
  "identifiedProduct",
);

export function filterObservation(
  observation: Observation,
  allowedCategoryKeys: readonly string[],
  requestImageIds: readonly string[],
): Observation {
  const categories = new Set(allowedCategoryKeys);
  const images = new Set(requestImageIds);
  const categoryCandidates = observation.categoryCandidates
    .filter((candidate) => categories.has(candidate.categoryKey))
    .map((candidate) => ({
      ...candidate,
      imageIds: [...new Set(candidate.imageIds.filter((id) => images.has(id)))],
    }))
    .filter((candidate) => candidate.imageIds.length > 0);
  const unknownFields = new Set(observation.unknownFields);
  if (categoryCandidates.length === 0) unknownFields.add("category");
  return {
    categoryCandidates,
    extractedTexts: observation.extractedTexts.filter((item) =>
      images.has(item.imageId),
    ),
    observedFeatures: observation.observedFeatures.filter((item) =>
      images.has(item.imageId),
    ),
    qualityIssues: [...new Set(observation.qualityIssues)],
    unknownFields: [...unknownFields],
    ...(observation.visualHints
      ? {
          visualHints: {
            suspectedBrands: tidy(observation.visualHints.suspectedBrands),
            productFamilyHints: tidy(
              observation.visualHints.productFamilyHints,
            ),
            appearance: tidy(observation.visualHints.appearance),
          },
        }
      : {}),
    // An identification without a product name says nothing worth showing.
    ...(observation.identifiedProduct?.productName.trim() ||
    observation.identifiedProduct?.modelName.trim()
      ? { identifiedProduct: observation.identifiedProduct }
      : {}),
  };
}

const tidy = (values: readonly string[]) => [
  ...new Set(values.map((v) => v.trim()).filter(Boolean)),
];
