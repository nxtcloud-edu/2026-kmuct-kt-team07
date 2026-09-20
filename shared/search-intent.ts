import { categories, type Category } from "./domain.js";
const terms: [Category, string[]][] = [
  ["brake_pad", ["브레이크 패드", "브레이크패드"]],
  ["inner_tube", ["타이어 튜브", "타이어튜브"]],
  ["toothbrush_head", ["칫솔모"]],
  ["shaver_head", ["면도망", "면도날"]],
  ["label_tape", ["라벨 테이프", "라벨테이프"]],
  ["mop_pad", ["교체 걸레", "청소패드", "걸레"]],
  ["sink_stopper", ["배수구 마개", "거름망"]],
  ["filter", ["필터", "filter"]],
  ["remote", ["리모컨"]],
  ["gasket", ["패킹"]],
  ["lid", ["뚜껑"]],
  ["straw", ["빨대"]],
  ["handle", ["손잡이"]],
  ["brush", ["브러시"]],
  ["hose", ["호스"]],
  ["shelf", ["선반"]],
  ["hinge", ["경첩"]],
  ["fastener", ["나사"]],
  ["wheel", ["바퀴"]],
  ["refill", ["리필심", "카트리지"]],
  ["eraser", ["지우개"]],
  ["blade", ["교체 날"]],
  ["bobbin", ["보빈"]],
];
/** A user's stated part takes precedence over incidental parts visible in a photo. */
export function searchIntent(query: string, category: Category = "other") {
  let productQuery = query.trim();
  let found: Category | undefined;
  for (const [key, aliases] of terms) {
    for (const alias of aliases) {
      const re = new RegExp(
        `(^|\\s)${alias.replace(/ /g, "\\s*")}(?=\\s|$)`,
        "iu",
      );
      if (re.test(productQuery)) {
        found ??= key;
        productQuery = productQuery.replace(re, " ").trim();
      }
    }
  }
  return {
    productQuery,
    category: category === "other" ? (found ?? category) : category,
    partLabel:
      categories[category === "other" ? (found ?? category) : category],
  };
}
