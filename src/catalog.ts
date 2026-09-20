import type { Observation } from "./observation.js";
import { brandAliases, capacityKey } from "../shared/product-identity.js";

/** Server-owned catalog data; never populate aliases or labels from model output. */
export interface CatalogVariant {
  variantId: string;
  modelName: string;
  aliases: readonly string[];
  capacity: string | null;
  generation: string | null;
  brand?: string;
}

/** Clear contradictory label text requires another check, even with one code match. */
export function hasIdentityConflict(observation: Observation, candidates: readonly CatalogVariant[]) {
  if (!candidates.length) return false;
  const clear = observation.extractedTexts.filter((t) => t.legibility === "clear");
  const brands = clear.filter((t) => t.role === "brand").map((t) => normalizeModel(t.text));
  const capacities = clear.filter((t) => t.role === "capacity")
    .map((t) => capacityKey(t.text)).filter((v): v is string => v !== null);
  if (new Set(capacities).size > 1) return true;
  return candidates.every((c) =>
    (c.brand && brands.some((b) => ![c.brand!, ...(brandAliases[c.brand!] ?? [])]
      .some((a) => normalizeModel(a) === b))) ||
    (c.capacity && capacities.some((v) => capacityKey(c.capacity!) !== v)),
  );
}

export function normalizeModel(text: string): string {
  return text
    .normalize("NFKC")
    .toUpperCase()
    .replace(/[\s\-‐‑‒–—−]/gu, "");
}

function ambiguousSignature(text: string): string {
  return normalizeModel(text)
    .replace(/[O0]/g, "0")
    .replace(/[I1]/g, "1")
    .replace(/[S5]/g, "5");
}

export interface ModelComparison {
  originalText: string;
  normalizedText: string;
  imageId: string;
  legibility: "clear" | "uncertain";
  matchedVariantIds: string[];
}

export function matchCatalogModels(
  observation: Observation,
  catalog: readonly CatalogVariant[],
) {
  const matchedIds = new Set<string>();
  const comparisons: ModelComparison[] = observation.extractedTexts
    .filter((item) => item.role === "model")
    .map((item) => {
      const normalizedText = normalizeModel(item.text);
      const matchedVariantIds = new Set<string>();
      if (normalizedText) {
        for (const variant of catalog) {
          const matches = [variant.modelName, ...variant.aliases].some(
            (alias) =>
              item.legibility === "uncertain"
                ? ambiguousSignature(alias) === ambiguousSignature(item.text)
                : normalizeModel(alias) === normalizedText,
          );
          if (matches) {
            matchedIds.add(variant.variantId);
            matchedVariantIds.add(variant.variantId);
          }
        }
      }
      return {
        originalText: item.text,
        normalizedText,
        imageId: item.imageId,
        legibility: item.legibility,
        matchedVariantIds: [...matchedVariantIds],
      };
    });
  // Equivalence signatures compare every O/0, I/1, S/5 combination against
  // aliases without allocating up to 2^60 strings. No candidates are truncated.
  const candidates = [
    ...new Map(
      catalog
        .filter((item) => matchedIds.has(item.variantId))
        .map((item) => [item.variantId, item]),
    ).values(),
  ];
  return { comparisons, candidates };
}

export function buildVariantQuestion(candidates: readonly CatalogVariant[]) {
  return {
    kind: "select_variant" as const,
    prompt: "제품의 용량·세대를 확인해 선택해 주세요.",
    options: candidates.map((candidate) => ({
      variantId: candidate.variantId,
      label: `${candidate.modelName} / ${candidate.capacity ?? "용량 미등록"} / ${candidate.generation ?? "세대 미등록"} (${candidate.variantId})`,
      capacity: candidate.capacity,
      generation: candidate.generation,
    })),
    allowUnknown: true as const,
  };
}
