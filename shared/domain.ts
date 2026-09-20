import { z } from "zod";

import {
  categoryLabels,
  productGroups,
  type PartCategory,
} from "./taxonomy.js";
export {
  productGroups,
  groupCategories,
  type ProductGroup,
} from "./taxonomy.js";
export const categorySchema = z.enum(
  Object.keys(categoryLabels) as [PartCategory, ...PartCategory[]],
);
export const productGroupSchema = z.enum(
  Object.keys(productGroups) as [
    keyof typeof productGroups,
    ...(keyof typeof productGroups)[],
  ],
);
export const categories = categoryLabels;
export type Category = PartCategory;
const text = z.string().min(1).max(500);
const id = z
  .string()
  .regex(/^[a-z0-9-]+$/)
  .max(100);
export const httpsUrl = z
  .string()
  .url()
  .refine((value) => {
    const u = new URL(value);
    return u.protocol === "https:" && !u.username && !u.password;
  }, "인증 정보 없는 HTTPS URL을 입력하세요.");
const date = z.iso.date();
export const sourceSchema = z.strictObject({
  url: httpsUrl,
  title: text,
  checkedAt: date,
  scope: z.enum(["content_reviewed", "link_only"]),
  accessNote: text.optional(),
});
export const productSchema = z.strictObject({
  variantId: id,
  group: productGroupSchema.default("drinkware"),
  brand: text,
  modelName: text,
  aliases: z.array(text),
  capacity: text.nullable(),
  generation: text.nullable(),
  region: text,
  description: text,
  source: sourceSchema,
  contact: sourceSchema,
});
export const partSchema = z.strictObject({
  partId: id,
  name: text,
  brand: text,
  category: categorySchema,
  origin: z.enum(["oem", "aftermarket", "generic", "unknown"]),
  specifications: z.array(text),
  lifecycle: z.enum(["current", "discontinued", "unknown"]),
  lifecycleSource: sourceSchema.optional(),
});
export const offerSchema = z.strictObject({
  offerId: id,
  partId: id,
  seller: text,
  condition: z.enum(["new", "used", "unknown"]),
  stock: z.enum(["in_stock", "out_of_stock", "unavailable", "unknown"]),
  stockCheckedAt: z.iso.datetime().optional(),
  linkCheck: z
    .strictObject({
      status: z.enum([
        "reachable",
        "redirected",
        "broken",
        "blocked",
        "network_error",
      ]),
      checkedAt: z.iso.datetime(),
      httpStatus: z.number().int().min(100).max(599).optional(),
    })
    .optional(),
  region: text,
  market: z.enum(["domestic", "overseas", "unknown"]).default("unknown"),
  optionLabel: text.optional(),
  source: sourceSchema,
});
export const evidenceSchema = z.strictObject({
  evidenceId: id,
  partId: id,
  variantId: id,
  claim: z.enum(["supports", "excludes", "unknown"]),
  provider: z.enum([
    "product_manufacturer",
    "part_manufacturer",
    "seller",
    "fit_report",
  ]),
  summary: text,
  conditions: z.array(text),
  source: sourceSchema,
});
export const catalogSchema = z
  .strictObject({
    version: z.literal(1),
    updatedAt: date,
    products: z.array(productSchema).min(1),
    parts: z.array(partSchema),
    offers: z.array(offerSchema),
    evidence: z.array(evidenceSchema),
  })
  .superRefine((catalog, ctx) => {
    for (const [list, key] of [
      [catalog.products, "variantId"],
      [catalog.parts, "partId"],
      [catalog.offers, "offerId"],
      [catalog.evidence, "evidenceId"],
    ] as const) {
      const values = (list as unknown as Record<string, unknown>[]).map(
        (item) => item[key],
      );
      if (new Set(values).size !== values.length)
        ctx.addIssue({ code: "custom", message: `중복 ${key}` });
    }
    const products = new Set(catalog.products.map((p) => p.variantId));
    const parts = new Set(catalog.parts.map((p) => p.partId));
    for (const e of catalog.evidence)
      if (!parts.has(e.partId) || !products.has(e.variantId))
        ctx.addIssue({
          code: "custom",
          message: `잘못된 근거 참조: ${e.evidenceId}`,
        });
    for (const o of catalog.offers)
      if (!parts.has(o.partId))
        ctx.addIssue({
          code: "custom",
          message: `잘못된 판매 참조: ${o.offerId}`,
        });
    for (const o of catalog.offers)
      if (o.stock === "in_stock" && (!o.stockCheckedAt || !o.optionLabel))
        ctx.addIssue({
          code: "custom",
          message: `주문 가능 표시는 확인 시각과 옵션이 필요합니다: ${o.offerId}`,
        });
    for (const p of catalog.parts)
      if (p.lifecycle === "discontinued" && !p.lifecycleSource)
        ctx.addIssue({
          code: "custom",
          message: `단종 근거 필요: ${p.partId}`,
        });
  });
export type Catalog = z.infer<typeof catalogSchema>;
export type Product = Catalog["products"][number];
export type Evidence = Catalog["evidence"][number];
export const providerLabels = {
  product_manufacturer: "제품 제조사 명시",
  part_manufacturer: "대체 부품 제조사 명시",
  seller: "판매처 명시",
  fit_report: "장착 사례",
} as const;
export const stockLabels = {
  in_stock: "확인 당시 주문 가능",
  out_of_stock: "확인 당시 품절",
  unavailable: "해당 판매처 판매 종료",
  unknown: "재고·배송 확인 필요",
} as const;
export const checks: Record<
  Category,
  { key: string; label: string; help: string }[]
> = {
  bobbin: [
    {
      key: "model",
      label: "재봉틀 모델·보빈 종류",
      help: "같은 외경도 높이·곡면·재질이 다를 수 있습니다. 제조사 지정 보빈 종류를 확인하세요.",
    },
    {
      key: "winder",
      label: "보빈 케이스·실감기 축",
      help: "재봉 가능 여부와 실감기 축에 맞는지는 별도입니다. 판매처의 예외 조건을 확인하세요.",
    },
  ],
  foot: [
    {
      key: "model",
      label: "본체 모델·끝단 규격",
      help: "스틱·다리의 모델과 끝단 형상을 확인하세요. 원형 지름만으로 확정하지 않습니다.",
    },
    {
      key: "surface",
      label: "사용 지면·고정 상태",
      help: "재질과 지면 조건, 제조사 장착 안내를 대조하세요.",
    },
  ],
  other: [
    {
      key: "part",
      label: "필요한 부품 이름·코드",
      help: "예: 가방 버클, 캐리어 바퀴, 재봉틀 보빈. 제품 설명서의 부품 번호가 있으면 함께 적어 주세요.",
    },
    {
      key: "mount",
      label: "장착부·규격",
      help: "고정 방식과 실제 측정한 규격을 확인하세요. 사진의 외형만으로 호환 여부를 확정하지 않아요.",
    },
    {
      key: "conditions",
      label: "사용 조건",
      help: "재질, 하중, 온도와 제조사 교체 가능 여부를 확인하세요.",
    },
  ],
  brake_pad: [
    {
      key: "model",
      label: "브레이크 캘리퍼 모델",
      help: "자전거 이름 대신 브레이크 몸체의 BR- 코드와 기존 패드 표기를 확인하세요.",
    },
    {
      key: "material",
      label: "패드·로터 재질 조건",
      help: "레진 전용 로터 여부와 제조사 허용 패드를 대조하세요. 제동 부품은 정비점 장착·제동 점검을 권장합니다.",
    },
  ],
  inner_tube: [
    {
      key: "etrto",
      label: "타이어 ETRTO 규격",
      help: "옆면의 폭-림 지름 표기(예: 37-622)를 그대로 입력하세요. 인치만 같아도 림 지름이 다를 수 있어요.",
    },
    {
      key: "valve",
      label: "밸브 종류·길이",
      help: "프레스타·슈레더·던롭과 밸브 길이를 확인하세요.",
    },
  ],
  filter: [
    {
      key: "model",
      label: "본체 전체 모델 코드",
      help: "본체 라벨과 기존 필터 코드를 함께 확인하세요.",
    },
    {
      key: "type",
      label: "필터 구성·방향",
      help: "필터 종류, 개수, 장착 방향을 공식 자료와 대조하세요.",
    },
  ],
  remote: [
    {
      key: "model",
      label: "본체 모델 코드",
      help: "외형이 같아도 신호와 기능이 다를 수 있어요. 본체 모델 코드와 리모컨 코드를 대조하세요.",
    },
    {
      key: "functions",
      label: "지원 기능",
      help: "버튼 구성과 페어링 방법을 확인하세요.",
    },
  ],
  brush: [
    {
      key: "model",
      label: "본체·헤드 모델",
      help: "브러시와 본체 모델을 함께 확인하세요.",
    },
    {
      key: "connection",
      label: "연결부 구조",
      help: "고정 버튼, 커넥터, 전동 여부를 비교하세요.",
    },
  ],
  hose: [
    {
      key: "connection",
      label: "연결 규격",
      help: "호스 지름, 나사 규격, 퀵커넥터 종류를 확인하세요.",
    },
    {
      key: "conditions",
      label: "용도·압력·온도",
      help: "실내·실외 용도와 허용 압력·온도를 제품 설명서와 대조하세요.",
    },
  ],
  shelf: [
    {
      key: "frame",
      label: "프레임 폭·깊이",
      help: "선반 크기와 가구 외부 크기는 다릅니다. 프레임 규격을 확인하세요.",
    },
    {
      key: "generation",
      label: "세대·제조 시기",
      help: "동일 제품명도 제작 시기에 따라 지지대와 구멍이 다를 수 있어요.",
    },
    {
      key: "load",
      label: "허용 하중·지지대",
      help: "선반 지지대 포함 여부와 하중을 확인하세요.",
    },
  ],
  hinge: [
    {
      key: "mount",
      label: "장착 구멍·방향",
      help: "컵 지름·깊이, 구멍 간격, 덮임 방식과 문 방향을 확인하세요.",
    },
    {
      key: "model",
      label: "제품·부품 번호",
      help: "가구 설명서의 부품 번호를 확인하세요.",
    },
  ],
  fastener: [
    {
      key: "model",
      label: "설명서 부품 번호",
      help: "가구·제품 설명서의 정확한 부품 번호를 확인하세요.",
    },
    {
      key: "thread",
      label: "나사 지름·피치·길이",
      help: "머리 형태와 나사산, 길이를 대조하세요. 사진만으로 규격을 확정하지 않아요.",
    },
  ],
  wheel: [
    {
      key: "mount",
      label: "축·고정 방식",
      help: "스템 지름·길이 또는 플레이트 구멍 간격을 확인하세요.",
    },
    {
      key: "load",
      label: "바퀴 지름·하중",
      help: "개별 바퀴의 허용 하중과 바닥 재질을 대조하세요.",
    },
  ],
  refill: [
    {
      key: "code",
      label: "기존 리필 코드",
      help: "펜 이름뿐 아니라 기존 리필의 SXR 등 전체 코드를 확인하세요.",
    },
    {
      key: "size",
      label: "길이·굵기·잉크",
      help: "단색·다색 리필 형태와 촉 굵기, 잉크 색상을 대조하세요.",
    },
  ],
  eraser: [
    {
      key: "code",
      label: "홀더·리필 코드",
      help: "홀더 모델과 전용 리필 코드를 확인하세요.",
    },
    {
      key: "shape",
      label: "단면·길이",
      help: "원형·사각형 단면과 리필 길이를 대조하세요.",
    },
  ],
  blade: [
    {
      key: "model",
      label: "본체·날 코드",
      help: "커터·공구의 모델명과 전용 날 코드를 확인하세요.",
    },
    {
      key: "mount",
      label: "날 폭·두께·고정 구조",
      help: "폭만 같다고 호환되지 않아요. 잠금·구멍 구조와 제조사 교체 안내를 확인하세요.",
    },
  ],
  toothbrush_head: [
    {
      key: "model",
      label: "칫솔 본체 계열",
      help: "본체 계열과 클릭식·나사식 연결을 확인하세요.",
    },
    {
      key: "type",
      label: "칫솔모 연결 타입",
      help: "전용 계열은 다른 칫솔모와 호환되지 않을 수 있어요.",
    },
  ],
  shaver_head: [
    {
      key: "model",
      label: "면도기 모델·Type 번호",
      help: "시리즈 이름만으로 고르지 말고 본체 Type 번호까지 확인하세요.",
    },
    {
      key: "cassette",
      label: "카세트 코드",
      help: "기존 면도망·날의 교체 코드를 대조하세요.",
    },
  ],
  lid: [
    {
      key: "connection",
      label: "결합 방식",
      help: "뚜껑과 입구의 나사산 또는 끼움 구조를 확인하세요.",
    },
    {
      key: "opening",
      label: "입구·나사산 규격",
      help: "판매처가 안내하는 측정 위치를 따르세요. 지름만 같아도 나사산이 다를 수 있습니다.",
    },
    {
      key: "version",
      label: "제품 용량·세대",
      help: "라벨과 구매 내역을 확인해 판매 옵션과 대조하세요.",
    },
  ],
  gasket: [
    {
      key: "inner",
      label: "내경·외경·두께",
      help: "기존 패킹과 장착 홈을 각각 재세요. 늘어나거나 변형된 패킹은 제조사 규격과 대조하세요.",
    },
    {
      key: "section",
      label: "단면 형태",
      help: "원형·사각형·입술형 등 단면과 홈의 형태를 확인하세요.",
    },
    {
      key: "material",
      label: "재질·사용 조건",
      help: "접촉 물질, 사용 온도·압력, 세척 조건을 공급자에게 확인하세요.",
    },
  ],
  straw: [
    {
      key: "length",
      label: "길이·지름",
      help: "기존 빨대의 길이와 내경·외경을 확인하세요.",
    },
    {
      key: "connection",
      label: "뚜껑 연결부",
      help: "연결부 모양과 고정 방식이 같은지 확인하세요.",
    },
    {
      key: "material",
      label: "재질·사용 온도",
      help: "식품 접촉 용도와 사용 온도를 공급자에게 확인하세요.",
    },
  ],
  handle: [
    {
      key: "mount",
      label: "장착 위치·간격",
      help: "손잡이가 고정되는 위치와 구멍 간격을 확인하세요.",
    },
    {
      key: "fastener",
      label: "고정 부품 규격",
      help: "나사 또는 클립의 규격과 길이를 확인하세요.",
    },
    {
      key: "load",
      label: "하중·사용 조건",
      help: "해당 제품용으로 안내된 부품인지 제조사에 확인하세요.",
    },
  ],
};
export const answerSchema = z
  .record(z.string().max(30), z.string().trim().max(120))
  .refine((v) => Object.keys(v).length <= 5);
export const feedbackSchema = z.strictObject({
  partId: id,
  outcome: z.enum(["fits", "does_not_fit", "not_tested"]),
  conditions: z.string().trim().min(1).max(500),
  testedAt: date,
});
