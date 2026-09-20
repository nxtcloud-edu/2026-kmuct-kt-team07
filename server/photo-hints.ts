import type { Observation } from "../src/observation.js";
import type {
  Product,
  Catalog,
  Category,
  ProductGroup,
} from "../shared/domain.js";
import { normalizeModel } from "../src/catalog.js";
import { brandAliases, capacityKey } from "../shared/product-identity.js";

// These are observable product types, never inferred model codes or compatibility claims.
const families = [
  ["공기청정기", "공기 청정기", "air purifier", "purifier"],
  ["청소기", "vacuum"],
  ["선풍기", "fan"],
  ["전동칫솔", "전동 칫솔", "toothbrush"],
  ["면도기", "shaver"],
  ["물병", "물통", "보틀", "bottle"],
  ["텀블러", "tumbler"],
  ["책장", "bookcase", "billy"],
  ["의자", "chair"],
  ["서랍", "drawer"],
  ["라벨프린터", "라벨 프린터", "label printer"],
  ["샤프", "mechanical pencil"],
  ["볼펜", "ballpoint"],
  ["지우개", "eraser"],
  ["커터", "cutter"],
  ["재봉틀", "sewing"],
  ["브레이크", "brake"],
  ["타이어", "tire", "tyre"],
  ["대걸레", "밀대", "mop"],
  ["정수기", "정수 용기", "water filter"],
  ["면도", "razor"],
  ["캐리어", "suitcase"],
  ["샤워", "shower"],
  ["가위", "scissors"],
  ["분무기", "sprayer"],
];
export function photoHints(
  observation: Observation | undefined,
  products: Product[],
  context: {
    group?: ProductGroup;
    category?: Category;
    catalog?: Catalog;
  } = {},
) {
  const empty = {
    products: [] as Product[],
    description: "",
    reasons: {} as Record<string, string[]>,
  };
  if (!observation) return empty;
  const clear = observation.extractedTexts.filter(
    (t) => t.legibility === "clear",
  );
  const brandTexts = clear.filter((t) => t.role === "brand");
  const brands = [
    ...new Set(
      brandTexts.map(
        (t) =>
          Object.entries(brandAliases).find(([brand, aliases]) =>
            [brand, ...aliases].some(
              (a) => normalizeModel(a) === normalizeModel(t.text),
            ),
          )?.[0],
      ),
    ),
  ];
  if (brands.length > 1 || (brandTexts.length > 0 && !brands[0])) return empty;
  const capacities = [
    ...new Set(
      clear
        .filter((t) => t.role === "capacity")
        .map((t) => capacityKey(t.text)),
    ),
  ];
  if (capacities.length > 1 || capacities.includes(null)) return empty;
  const brand = brands[0],
    capacity = capacities[0];
  const visual = observation.observedFeatures
    .filter((f) => ["product_type", "appearance", "other"].includes(f.key))
    .map((f) => f.value.toLowerCase())
    .join(" ");
  const observedFamilies = families.filter((words) =>
    words.some((w) => visual.includes(w)),
  );
  if (!brand && !observedFamilies.length) return empty;
  const ranked = products
    .flatMap((p) => {
      if (brand && p.brand !== brand) return [];
      if (capacity && (!p.capacity || capacityKey(p.capacity) !== capacity))
        return [];
      if (
        context.group &&
        context.group !== "household" &&
        p.group !== context.group
      )
        return [];
      const text = [p.modelName, p.description, ...p.aliases]
        .join(" ")
        .toLowerCase();
      const types = observedFamilies.filter((words) =>
        words.some((w) => text.includes(w)),
      );
      if (observedFamilies.length && !types.length) return [];
      const reasons = [
        ...(brand ? [`라벨의 ${brand} 표기`] : []),
        ...(capacity ? [`라벨의 ${capacity} 표기`] : []),
        ...types.map((words) => `사진 속 ${words[0]} 형태`),
      ];
      let score = (brand ? 6 : 0) + (capacity ? 3 : 0) + types.length * 4;
      if (context.category && context.category !== "other" && context.catalog) {
        const partIds = new Set(
          context.catalog.parts
            .filter((part) => part.category === context.category)
            .map((part) => part.partId),
        );
        if (
          context.catalog.evidence.some(
            (e) =>
              e.variantId === p.variantId &&
              partIds.has(e.partId) &&
              e.claim === "supports",
          )
        )
          score += 2;
      }
      return [{ product: p, score, reasons }];
    })
    .sort((a, b) => b.score - a.score);
  if (!ranked.length) return empty;
  // Preserve the complete set for explicit label hints; bounded visual discovery otherwise.
  const suggestions = observedFamilies.length ? ranked.slice(0, 8) : ranked;
  return {
    products: suggestions.map((x) => x.product),
    reasons: Object.fromEntries(
      suggestions.map((x) => [x.product.variantId, x.reasons]),
    ),
    description: observedFamilies.length
      ? "사진에서 보이는 제품 종류와 특징으로 추정한 후보예요. 모델이 확인된 것은 아니므로 사진·제품 정보를 비교해 선택해 주세요."
      : `사진에서 읽힌 ${brand}${capacity ? ` · ${capacity}` : ""} 기준의 참고 후보입니다. 모델이 확인된 것은 아니므로 제품명과 형태를 직접 대조하세요.`,
  };
}
