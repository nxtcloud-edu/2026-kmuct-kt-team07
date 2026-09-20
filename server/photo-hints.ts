import type { Observation } from "../src/observation.js";
import type {
  Product,
  Catalog,
  Category,
  ProductGroup,
} from "../shared/domain.js";
import { normalizeModel } from "../src/catalog.js";
import { brandAliases, capacityKey } from "../shared/product-identity.js";
import { kindsIn, productKind } from "../shared/product-kind.js";

const empty = {
  products: [] as Product[],
  description: "",
  reasons: {} as Record<string, string[]>,
  kinds: [] as string[],
  best: null as string | null,
  guess: "",
};

const catalogBrand = (text: string) =>
  Object.entries(brandAliases).find(([name, aliases]) =>
    [name, ...aliases].some((a) => normalizeModel(a) === normalizeModel(text)),
  )?.[0];
const squash = (value: string) =>
  value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[\s()]/gu, "");
// Words every series name shares say nothing about which series it is.
const commonSeriesWords = new Set(
  ["오브제컬렉션", "퓨리케어", "공기청정기", "청소기", "텀블러", "시리즈"].map(
    squash,
  ),
);
/** "에어로타워", "블루스카이" — the parts of a series name worth recognising. */
const seriesWords = (product: Product) =>
  (product.series ?? "")
    .split(/[\s()+]+/u)
    .map((word) => ({ word, key: squash(word) }))
    .filter((w) => w.key.length >= 3 && !commonSeriesWords.has(w.key));

/**
 * Photo-based recommendations. A model code read from a label is handled
 * elsewhere and is the only thing that identifies a product; everything here is
 * a recommendation the user confirms. The catalog is ordered by how many clues it
 * shares with the photo: part of a code, a brand read from the label, the product
 * type, and the observer's guesses from design alone (brand, series, shape).
 * Compatibility still comes only from sourced evidence.
 */
export function photoHints(
  observation: Observation | undefined,
  products: Product[],
  context: {
    group?: ProductGroup;
    category?: Category;
    catalog?: Catalog;
  } = {},
) {
  if (!observation) return empty;
  const clear = observation.extractedTexts.filter(
    (t) => t.legibility === "clear",
  );
  const brandTexts = clear.filter((t) => t.role === "brand");
  const brands = [...new Set(brandTexts.map((t) => catalogBrand(t.text)))];
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
  // A logo read with doubt cannot exclude anything, but it can order the list.
  const softBrands = new Set(
    observation.extractedTexts
      .filter((t) => t.role === "brand" && t.legibility === "uncertain")
      .map((t) => catalogBrand(t.text))
      .filter((name): name is string => Boolean(name)),
  );
  const softBrand = !brand && softBrands.size === 1 ? [...softBrands][0]! : "";
  // Guesses from design alone: weaker than anything read, never a filter.
  const visual = observation.visualHints;
  const lookBrands = brand
    ? []
    : [
        ...new Set(
          (visual?.suspectedBrands ?? [])
            .map(catalogBrand)
            .filter((name): name is string => Boolean(name)),
        ),
      ];
  const lookWords = [
    ...(visual?.productFamilyHints ?? []),
    ...(visual?.appearance ?? []),
  ]
    .flatMap((hint) => hint.split(/[\s()+]+/u))
    .map(squash)
    .filter(Boolean);
  // "에어로" inside "에어로타워" is not a match: short words must be whole words.
  const looksLike = (word: string) =>
    lookWords.some(
      (hint) => hint === word || (word.length >= 4 && hint.includes(word)),
    );
  const seenKinds = kindsIn(
    observation.observedFeatures
      .filter((f) => ["product_type", "appearance", "other"].includes(f.key))
      .map((f) => f.value)
      .join(" "),
  );
  const kinds = seenKinds.length
    ? seenKinds
    : kindsIn((visual?.productFamilyHints ?? []).join(" "));
  // A cropped or partly legible code ("AX34A53") still narrows the list.
  const fragments = [
    ...new Map(
      observation.extractedTexts
        .filter((t) => t.role === "model")
        .map((t) => ({ text: t.text, key: normalizeModel(t.text) }))
        .filter((t) => t.key.length >= 4)
        .map((t) => [t.key, t] as const),
    ).values(),
  ];
  const partIds =
    context.category && context.category !== "other" && context.catalog
      ? new Set(
          context.catalog.parts
            .filter((part) => part.category === context.category)
            .map((part) => part.partId),
        )
      : undefined;
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
      const sameKind = kinds.includes(productKind(p).kind);
      const names = [p.modelName, ...p.aliases].map(normalizeModel);
      const read = fragments
        .map((f) => ({
          text: f.text,
          score: names.some((n) => n.startsWith(f.key))
            ? 8
            : names.some((n) => n.includes(f.key))
              ? 5
              : 0,
        }))
        .filter((f) => f.score > 0);
      const looksLikeBrand = softBrand === p.brand;
      const lookRank = lookBrands.indexOf(p.brand);
      const family = seriesWords(p).filter((w) => looksLike(w.key));
      // A visible product type must agree unless part of the code was read.
      if (kinds.length && !sameKind && !read.length) return [];
      // Something about this product has to match the photo.
      if (!brand && !sameKind && !read.length && !family.length && lookRank < 0)
        return [];
      const reasons = [
        ...read.map((f) => `라벨의 “${f.text}” 글자`),
        ...(brand ? [`라벨의 ${brand} 표기`] : []),
        ...(capacity ? [`라벨의 ${capacity} 표기`] : []),
        ...(looksLikeBrand ? [`${p.brand}로 보이는 로고`] : []),
        ...(family.length ? [`${family[0]!.word} 계열과 비슷한 디자인`] : []),
        ...(lookRank >= 0 && !looksLikeBrand && !family.length
          ? [`${p.brand} 제품과 비슷한 디자인`]
          : []),
        ...(sameKind ? [`사진 속 ${productKind(p).kind} 형태`] : []),
      ];
      let score =
        Math.max(0, ...read.map((f) => f.score)) +
        (brand ? 6 : 0) +
        (looksLikeBrand ? 3 : 0) +
        (capacity ? 3 : 0) +
        (sameKind ? 4 : 0) +
        (family.length ? 3 : 0) +
        (lookRank >= 0 ? 2.5 - lookRank * 0.5 : 0);
      if (
        partIds &&
        context.catalog!.evidence.some(
          (e) =>
            e.variantId === p.variantId &&
            partIds.has(e.partId) &&
            e.claim === "supports",
        )
      )
        score += 2;
      return [
        {
          product: p,
          score,
          reasons,
          read: read.length > 0,
          family: family.length > 0,
        },
      ];
    })
    // Equal clues: a product with a photo is easier for the user to confirm.
    .sort(
      (a, b) =>
        b.score - a.score ||
        Number(Boolean(b.product.image)) - Number(Boolean(a.product.image)),
    );
  // A doubtful logo or a capacity alone says too little to recommend anything.
  const grounded =
    Boolean(brand) ||
    kinds.length > 0 ||
    fragments.length > 0 ||
    lookBrands.length > 0 ||
    ranked.some((x) => x.family);
  if (!ranked.length || !grounded) return empty;
  // A clear brand or part of a code names a finite set worth showing in full.
  // Anything weaker can cover a hundred models: show the best few instead.
  const narrowed = Boolean(brand) || ranked[0]!.read;
  const suggestions = narrowed ? ranked : spreadByBrand(ranked).slice(0, 8);
  return {
    products: suggestions.map((x) => x.product),
    reasons: Object.fromEntries(
      suggestions.map((x) => [x.product.variantId, x.reasons]),
    ),
    kinds,
    // Only a clue no other product shares earns the top spot by name.
    best:
      ranked[0]!.score > (ranked[1]?.score ?? -1)
        ? ranked[0]!.product.variantId
        : null,
    // What the photo looks like, in words a person can search for.
    guess: [
      visual?.suspectedBrands[0] ?? softBrand,
      visual?.productFamilyHints[0] ?? kinds[0] ?? "",
    ]
      .filter(Boolean)
      .join(" "),
    description:
      kinds.length || fragments.length || lookBrands.length
        ? "사진에서 보이는 제품 종류·글자·디자인으로 추정한 추천 후보예요. 모델이 확인된 것은 아니므로 사진·제품 정보를 비교해 선택해 주세요."
        : `사진에서 읽힌 ${brand}${capacity ? ` · ${capacity}` : ""} 기준의 참고 후보입니다. 모델이 확인된 것은 아니므로 제품명과 형태를 직접 대조하세요.`,
  };
}

/** Round-robin across brands so one large family does not fill every slot. */
function spreadByBrand<T extends { product: Product; score: number }>(
  ranked: T[],
): T[] {
  const byBrand = new Map<string, T[]>();
  for (const item of ranked)
    byBrand.set(item.product.brand, [
      ...(byBrand.get(item.product.brand) ?? []),
      item,
    ]);
  const buckets = [...byBrand.values()];
  const result: T[] = [];
  for (let i = 0; buckets.some((b) => i < b.length); i++)
    for (const bucket of buckets) if (bucket[i]) result.push(bucket[i]!);
  // Keep the strongest clue first even after spreading.
  return result.sort((a, b) => b.score - a.score);
}
