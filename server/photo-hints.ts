import type { Observation } from "../src/observation.js";
import type { Product } from "../shared/domain.js";
import { normalizeModel } from "../src/catalog.js";

import { brandAliases, capacityKey } from "../shared/product-identity.js";

/** Discovery hints only: never identify a model or overwrite exact OCR candidates. */
export function photoHints(
  observation: Observation | undefined,
  products: Product[],
) {
  const empty = { products: [] as Product[], description: "" };
  if (!observation) return empty;
  const clear = observation.extractedTexts.filter(
    (t) => t.legibility === "clear",
  );
  const brandTexts = clear.filter((t) => t.role === "brand");
  const brands = [
    ...new Set(
      brandTexts.map(
        (t) =>
          Object.entries(brandAliases).find(([, aliases]) =>
            aliases.some((a) => normalizeModel(a) === normalizeModel(t.text)),
          )?.[0],
      ),
    ),
  ];
  // Conflicting or unknown brand readings must not narrow the list to one product.
  if (brands.length !== 1 || !brands[0]) return empty;
  const capacityTexts = clear.filter((t) => t.role === "capacity");
  const capacities = [
    ...new Set(capacityTexts.map((t) => capacityKey(t.text))),
  ];
  if (capacities.length > 1 || capacities.includes(null)) return empty;
  const capacity = capacities[0];
  const matches = products.filter(
    (p) =>
      p.brand === brands[0] &&
      (!capacity || (p.capacity && capacityKey(p.capacity) === capacity)),
  );
  if (!matches.length) return empty;
  return {
    products: matches,
    description: `사진에서 읽힌 ${brands[0]}${capacity ? ` · ${capacity}` : ""} 기준의 참고 후보입니다. 모델이 확인된 것은 아니므로 제품명과 형태를 직접 대조하세요.`,
  };
}
