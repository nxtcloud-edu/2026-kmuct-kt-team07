import { ArrowUpRight } from "lucide-react";
import { providerLabels, stockLabels, type Product } from "../shared/domain";
import { offerLinkNote, offerLinkUsable } from "../shared/availability";
import Verdict from "./Verdict";
import { external, originLabels, reviewLabels } from "./labels";
import type { PartCard } from "./types";

/** Step 4. One part: where to buy it, then why it fits. */
export default function PartPage({
  card,
  product,
  onBack,
  onFeedback,
}: {
  card: PartCard;
  product: Product;
  onBack: () => void;
  onFeedback: () => void;
}) {
  const blocked = ["excluded", "conflict"].includes(card.status);
  return (
    <section className="page" aria-labelledby="page-title">
      <button className="back-link" onClick={onBack}>
        ← 부품 목록
      </button>
      <p className="kicker">
        {product.brand} {product.modelName}
      </p>
      <h1 id="page-title" tabIndex={-1} className="model">
        {card.part.name}
      </h1>
      <p className="page-lead">
        {originLabels[card.part.origin]} · {card.part.brand}
      </p>
      <Verdict status={card.status} />
      {card.part.specifications.length > 0 && (
        <ul className="spec-list">
          {card.part.specifications.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      )}
      {!blocked && (
        <>
          <h2 className="list-title">살 수 있는 곳</h2>
          {card.offers.length === 0 && (
            <p className="hint">
              등록된 구매처가 아직 없어요. 부품 목록의 ‘찾는 부품이 없어요’에서
              검색·문의 방법을 확인해 주세요.
            </p>
          )}
          <ul className="offer-list">
            {card.offers.map((o) => (
              <li className="offer" key={o.offerId}>
                <p className="offer-state">
                  <strong>
                    {o.market === "domestic"
                      ? "국내"
                      : o.market === "overseas"
                        ? "해외"
                        : "지역 확인 필요"}{" "}
                    · {o.seller}
                  </strong>
                  <span>
                    {stockLabels[o.availability.stock]} ·{" "}
                    {o.condition === "used"
                      ? "중고"
                      : o.condition === "new"
                        ? "새상품"
                        : "상태 미확인"}
                  </span>
                </p>
                {o.optionLabel && (
                  <p className="offer-option">구매 옵션: {o.optionLabel}</p>
                )}
                {offerLinkNote(o) && (
                  <p className="offer-link-note">
                    {offerLinkNote(o)}{" "}
                    <small>
                      링크 확인:{" "}
                      {new Date(o.linkCheck!.checkedAt).toLocaleDateString(
                        "ko-KR",
                      )}
                    </small>
                  </p>
                )}
                {offerLinkUsable(o) && (
                  <a
                    className={`purchase-link${
                      card.status === "source_supported" &&
                      !["unavailable", "out_of_stock"].includes(
                        o.availability.stock,
                      )
                        ? " strong"
                        : ""
                    }`}
                    {...external(o.source.url)}
                  >
                    {o.availability.stock === "unavailable"
                      ? "판매 종료 안내 보기"
                      : o.availability.stock === "out_of_stock"
                        ? "품절·재입고 안내 보기"
                        : "판매 페이지에서 확인"}
                    <ArrowUpRight size={16} />
                  </a>
                )}
                <small>
                  {o.region}
                  {o.stock !== "unknown" &&
                    ` · 주문 상태 확인: ${o.stockCheckedAt ? new Date(o.stockCheckedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) : o.source.checkedAt}`}
                  {o.availability.expired && o.stock !== "unknown"
                    ? " · 확인 후 시간이 지나 재확인이 필요해요."
                    : ""}
                </small>
                {o.source.accessNote && <small>{o.source.accessNote}</small>}
              </li>
            ))}
          </ul>
        </>
      )}
      <h2 className="list-title">
        {blocked ? "사면 안 되는 이유" : "왜 맞는 부품인가요?"}
      </h2>
      <ul className="evidence-list">
        {card.evidence.map((e) => (
          <li className="evidence" key={e.evidenceId}>
            <span className="evidence-provider">
              {providerLabels[e.provider]}
            </span>
            <p>{e.summary}</p>
            {e.conditions.length > 0 && (
              <ul>
                {e.conditions.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            )}
            <p className="evidence-source">
              <a {...external(e.source.url)}>
                근거 자료 열기
                <ArrowUpRight size={13} />
              </a>
              <small>
                {e.source.checkedAt} 확인
                {card.stale ? " · 재확인 필요" : ""}
              </small>
            </p>
            {e.source.accessNote && <small>{e.source.accessNote}</small>}
          </li>
        ))}
      </ul>
      {card.part.lifecycle === "discontinued" && card.part.lifecycleSource && (
        <p className="hint">
          제조사 공식 판매 종료 ·{" "}
          <a {...external(card.part.lifecycleSource.url)}>안내 보기</a>
        </p>
      )}
      <p className="hint">
        ‘{reviewLabels.source_supported}’은 출처의 설명이며 실제 장착 검증을
        뜻하지 않아요. 재고·배송·옵션은 판매처에서 최종 확인해 주세요.
      </p>
      {!blocked && (
        <button className="text-button" onClick={onFeedback}>
          이 부품을 장착해 봤어요 · 결과 기록
        </button>
      )}
    </section>
  );
}
