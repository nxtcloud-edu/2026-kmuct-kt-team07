import {
  categories,
  checks,
  type Catalog,
  type Category,
  type Evidence,
} from "../shared/domain.js";
import { offerAvailability, offerPriority } from "../shared/availability.js";

/** A claim is never upgraded by availability, appearance or user-entered dimensions. */
export function reviewEvidence(evidence: Evidence[], now = new Date()) {
  const includes = evidence.filter((e) => e.claim === "supports");
  const excludes = evidence.filter((e) => e.claim === "excludes");
  const stale = evidence.some(
    (e) => now.getTime() - Date.parse(e.source.checkedAt) > 180 * 86400000,
  );
  const status =
    includes.length && excludes.length
      ? "conflict"
      : excludes.length
        ? "excluded"
        : !includes.length
          ? "unverified"
          : stale ||
              includes.some(
                (e) =>
                  e.conditions.length || e.source.scope !== "content_reviewed",
              )
            ? "check_required"
            : "source_supported";
  return { status, stale, evidence };
}

export function resolvePaths(
  catalog: Catalog,
  variantId: string | null,
  category: Category,
  query: string,
  answers: Record<string, string> = {},
) {
  const product =
    catalog.products.find((p) => p.variantId === variantId) ?? null;
  const cards = product
    ? catalog.parts
        .filter((p) => p.category === category)
        .flatMap((part) => {
          const evidence = catalog.evidence.filter(
            (e) =>
              e.partId === part.partId && e.variantId === product.variantId,
          );
          if (!evidence.length) return [];
          return [
            {
              part,
              ...reviewEvidence(evidence),
              offers: catalog.offers
                .filter((o) => o.partId === part.partId)
                .sort((a, b) => offerPriority(a) - offerPriority(b))
                .map((o) => ({ ...o, availability: offerAvailability(o) })),
            },
          ];
        })
    : [];
  const phrase = product
    ? `${product.brand} ${product.modelName}`
    : query.trim().slice(0, 120) || "물병 텀블러";
  const search = (label: string, term: string) => ({
    label,
    kind: "search_results" as const,
    url: `https://www.google.com/search?q=${encodeURIComponent(term)}`,
    verified: false,
  });
  return {
    product,
    category,
    cards,
    checks: checks[category].map((c) => ({
      ...c,
      answer: answers[c.key] ?? "",
    })),
    searches: [
      search("국내 판매처 검색", `${phrase} ${categories[category]} 구매`),
      search(
        "범용 부품 검색",
        `${categories[category]} 범용 ${Object.values(answers).filter(Boolean).join(" ")}`,
      ),
      search(
        "동일 모델 중고 부품 검색",
        `${phrase} ${categories[category]} 중고`,
      ),
      search("수리·제조사 문의 검색", `${phrase} 수리 고객센터`),
    ],
    contactDraft: `안녕하세요. ${phrase || "물병·텀블러"}의 ${categories[category]}을 구하고 있습니다.\n정품 부품 구매 또는 수리 접수가 가능한지, 대체 부품이 있다면 적용 모델과 확인해야 할 규격을 안내해 주세요.\n${checks[category].map((c) => `${c.label}: ${answers[c.key] || "미확인"}`).join("\n")}\n국내 구매·배송 가능 여부도 확인 부탁드립니다.`,
  };
}
export type PathsResult = ReturnType<typeof resolvePaths>;
