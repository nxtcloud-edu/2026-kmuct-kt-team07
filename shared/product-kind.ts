import { productGroups } from "./taxonomy.js";
import type { Product } from "./domain.js";

/**
 * The everyday name people type or a photo shows ("공기청정기", "텀블러").
 * Discovery vocabulary only: it widens search and orders photo estimates. It is
 * never evidence of a model code or of compatibility.
 */
type KindRule = {
  kind: string;
  words: string[];
  match: (product: Product, text: string) => boolean;
};
const has = (pattern: RegExp) => (_: Product, text: string) =>
  pattern.test(text);
const rules: KindRule[] = [
  {
    kind: "공기청정기",
    words: ["공기청정기", "공기 청정기", "air purifier", "purifier"],
    match: (p, text) =>
      /공기\s*청정기/u.test(text) ||
      (p.brand === "삼성" && /^AX\d/u.test(p.modelName)) ||
      (p.brand === "LG" && /^(AS|FS)\d/u.test(p.modelName)),
  },
  {
    kind: "청소기",
    words: ["청소기", "무선청소기", "무선 청소기", "vacuum"],
    match: has(/청소기/u),
  },
  {
    kind: "라벨프린터",
    words: ["라벨프린터", "라벨 프린터", "label printer", "라벨기"],
    match: has(/라벨\s*프린터/u),
  },
  {
    kind: "정수기",
    words: ["정수기", "정수 용기", "정수용기", "water filter", "water pitcher"],
    match: has(/정수/u),
  },
  {
    kind: "전동칫솔",
    words: ["전동칫솔", "전동 칫솔", "칫솔", "toothbrush"],
    match: (p, text) => p.brand === "필립스" || /칫솔/u.test(text),
  },
  {
    kind: "자전거 브레이크",
    words: ["자전거", "브레이크", "캘리퍼", "brake", "bicycle"],
    match: has(/브레이크|캘리퍼/u),
  },
  {
    kind: "책장",
    words: ["책장", "책꽂이", "bookcase", "bookshelf"],
    match: has(/BILLY|빌리/u),
  },
  {
    kind: "수납장",
    words: ["수납장", "거실장", "cabinet"],
    match: has(/BEST[ÅA]|베스토/u),
  },
  {
    kind: "옷장",
    words: ["옷장", "붙박이장", "wardrobe"],
    match: has(/PAX|팍스/u),
  },
  {
    kind: "싱크대 배수트랩",
    words: ["배수트랩", "싱크대 배수구", "sink trap"],
    match: has(/배수트랩|LILLVIKEN/u),
  },
  {
    kind: "볼펜",
    words: ["볼펜", "ballpoint"],
    match: has(/JETSTREAM|제트스트림/u),
  },
  {
    kind: "지우개",
    words: ["지우개", "eraser"],
    match: has(/MONO zero|지우개/u),
  },
  {
    kind: "커터칼",
    words: ["커터칼", "커터", "cutter"],
    match: has(/커터/u),
  },
  {
    kind: "호스 연결구",
    words: ["호스 연결구", "원예용 호스", "연결구", "hose connector"],
    match: has(/연결구|GARDENA/u),
  },
  {
    kind: "반려동물 급수기",
    words: ["급수기", "반려동물 급수기", "pet fountain"],
    match: has(/급수기|Drinkwell/u),
  },
  {
    kind: "유모차",
    words: ["유모차", "스트롤러", "stroller"],
    match: (p, text) => p.brand === "부가부" || /스트롤러|유모차/u.test(text),
  },
  {
    kind: "재봉틀",
    words: ["재봉틀", "미싱", "sewing"],
    match: has(/재봉틀/u),
  },
  {
    kind: "등산 스틱",
    words: ["등산스틱", "등산 스틱", "trekking pole"],
    match: has(/등산\s*스틱/u),
  },
  {
    kind: "밀대·청소도구",
    words: ["밀대", "대걸레", "걸레", "청소도구", "mop"],
    match: has(/청소도구/u),
  },
  {
    kind: "텀블러",
    words: ["텀블러", "보온컵", "tumbler"],
    match: has(/텀블러/u),
  },
  {
    kind: "물병",
    words: ["물병", "물통", "보틀", "bottle"],
    match: has(/보틀|물병|bottle/iu),
  },
  {
    kind: "텀블러·보온병",
    words: ["텀블러", "보온병", "물병", "보틀", "tumbler", "bottle"],
    match: (p) => p.group === "drinkware",
  },
];

/** Everyday names a photo observer can choose from; the catch-all is left out. */
export const kindNames = rules
  .map((r) => r.kind)
  .filter((kind) => kind !== "텀블러·보온병");

const cache = new WeakMap<Product, { kind: string; words: string[] }>();
export function productKind(product: Product) {
  const known = cache.get(product);
  if (known) return known;
  const text = [
    product.modelName,
    product.series ?? "",
    ...product.aliases,
    product.description,
    product.source.title,
  ].join(" ");
  const rule = rules.find((r) => r.match(product, text));
  const result = rule
    ? { kind: rule.kind, words: rule.words }
    : { kind: productGroups[product.group], words: [] as string[] };
  cache.set(product, result);
  return result;
}

const squash = (value: string) =>
  value.normalize("NFKC").toLocaleLowerCase().replace(/\s/gu, "");
/** Kinds named in free text, such as a photo's observed product type. */
export function kindsIn(text: string): string[] {
  const target = squash(text);
  return rules
    .filter((r) => r.words.some((w) => target.includes(squash(w))))
    .map((r) => r.kind);
}
