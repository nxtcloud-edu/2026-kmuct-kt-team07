export const productGroups = {
  bicycle: "자전거·이동용품",
  electronics: "전자제품·청소가전",
  furniture: "가구·수납",
  stationery: "학용품·사무용품",
  kitchen: "주방·정수용품",
  personal_care: "욕실·개인 위생",
  tools: "공구·취미용품",
  outdoor: "원예·야외용품",
  drinkware: "물병·텀블러",
  household: "기타 생활용품",
} as const;
export type ProductGroup = keyof typeof productGroups;
export const categoryLabels = {
  lid: "뚜껑", gasket: "패킹", straw: "빨대", handle: "손잡이",
  brake_pad: "브레이크 패드", inner_tube: "타이어 튜브",
  filter: "필터", remote: "리모컨", brush: "브러시·청소툴", hose: "호스·연결구",
  shelf: "선반", hinge: "경첩", fastener: "나사·고정부품", wheel: "바퀴",
  refill: "리필심·카트리지", eraser: "교체 지우개", blade: "교체 날",
  toothbrush_head: "칫솔모", shaver_head: "면도망·면도날",
} as const;
export type PartCategory = keyof typeof categoryLabels;
export const groupCategories: Record<ProductGroup, readonly PartCategory[]> = {
  drinkware: ["lid", "gasket", "straw", "handle"],
  bicycle: ["brake_pad", "inner_tube", "handle", "fastener"],
  electronics: ["filter", "remote", "brush", "hose"],
  furniture: ["shelf", "hinge", "fastener", "wheel", "handle"],
  stationery: ["refill", "eraser", "blade"],
  kitchen: ["filter", "gasket", "lid", "handle"],
  personal_care: ["toothbrush_head", "shaver_head", "filter", "hose"],
  tools: ["blade", "brush", "fastener", "handle"],
  outdoor: ["hose", "gasket", "wheel", "fastener"],
  household: Object.keys(categoryLabels) as PartCategory[],
};
