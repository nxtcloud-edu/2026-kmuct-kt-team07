import { ArrowUpRight } from "lucide-react";
import { categories, groupCategories, type Category } from "../shared/domain";
import type { CatalogProduct } from "../shared/catalog-search";
import ProductImage from "./ProductImage";
import Verdict from "./Verdict";
import { displayUrl, external, originLabels } from "./labels";
import type { PartCard, RecordResult } from "./types";

/** Step 3. The confirmed product and the parts that fit it; details live one page on. */
export default function PartsPage({
  result,
  product,
  busy,
  onCategory,
  onOpen,
  onOtherProduct,
  onHelp,
}: {
  result: RecordResult;
  product: CatalogProduct | undefined;
  busy: boolean;
  onCategory: (category: Category) => void;
  onOpen: (card: PartCard) => void;
  onOtherProduct: () => void;
  onHelp: () => void;
}) {
  const selected = result.paths.product!;
  const cards = result.paths.cards;
  const usable = cards.filter(
    (c) => !["excluded", "conflict"].includes(c.status),
  );
  const avoid = cards.filter((c) =>
    ["excluded", "conflict"].includes(c.status),
  );
  const available = product?.availableCategories ?? [];
  // Parts with data first; the rest of the group stays reachable.
  const tabs = [
    ...new Set<Category>([
      ...available,
      result.category,
      ...groupCategories[selected.group],
      "other",
    ]),
  ];
  const part = categories[result.category];
  const url = selected.image?.sourceUrl ?? selected.source.url;
  return (
    <section className="page" aria-labelledby="page-title">
      <div className="product-head">
        <ProductImage product={selected} />
        <div>
          <p className="kicker">
            {selected.brand}
            {selected.series || product
              ? ` · ${selected.series ?? product!.kind}`
              : ""}
          </p>
          <h1 id="page-title" tabIndex={-1} className="model">
            {selected.modelName}
          </h1>
          <p className="product-head-meta">
            {[selected.capacity, selected.region].filter(Boolean).join(" · ")}
          </p>
          <a className="source-url" {...external(url)}>
            <span>{displayUrl(url)}</span>
            <ArrowUpRight size={13} />
          </a>
        </div>
        <button
          className="text-button"
          disabled={busy}
          onClick={onOtherProduct}
        >
          다른 제품 선택
        </button>
      </div>
      <div className="part-tabs" role="group" aria-label="찾는 부품">
        {tabs.map((key) => (
          <button
            key={key}
            disabled={busy}
            aria-pressed={result.category === key}
            className={`${result.category === key ? "selected" : ""}${
              available.includes(key) ? "" : " no-data"
            }`}
            onClick={() => onCategory(key)}
          >
            {categories[key]}
          </button>
        ))}
      </div>
      {usable.length > 0 ? (
        <>
          <h2 className="list-title">
            맞는 {part} {usable.length}개
          </h2>
          <ul className="part-list">
            {usable.map((card) => (
              <li key={card.part.partId}>
                <button className="part-row" onClick={() => onOpen(card)}>
                  <Verdict status={card.status} />
                  <span className="part-row-body">
                    <strong className="model">{card.part.name}</strong>
                    <small>
                      {originLabels[card.part.origin]} · {card.part.brand}
                    </small>
                    {card.part.specifications.slice(0, 2).map((s) => (
                      <small className="spec" key={s}>
                        {s}
                      </small>
                    ))}
                  </span>
                  <span className="part-row-go">
                    {card.offers.length
                      ? `구매처 ${card.offers.length}곳 보기`
                      : "근거 보기"}{" "}
                    →
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <div className="empty-result">
          <h2>이 제품의 {part} 자료는 아직 없어요</h2>
          <p>
            판매하지 않는다는 뜻은 아니에요. 검색 링크와 제조사 문의로 더 찾아볼
            수 있어요.
          </p>
          <button className="primary" onClick={onHelp}>
            다른 방법으로 찾기
          </button>
        </div>
      )}
      {avoid.length > 0 && (
        <div className="avoid">
          <h2 className="list-title">사면 안 되는 {part}</h2>
          <ul className="part-list">
            {avoid.map((card) => (
              <li key={card.part.partId}>
                <button className="part-row" onClick={() => onOpen(card)}>
                  <Verdict status={card.status} />
                  <span className="part-row-body">
                    <strong className="model">{card.part.name}</strong>
                    <small>
                      {originLabels[card.part.origin]} · {card.part.brand}
                    </small>
                  </span>
                  <span className="part-row-go">이유 보기 →</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {usable.length > 0 && (
        <div className="page-footer">
          <button className="text-button" onClick={onHelp}>
            찾는 부품이 없어요
          </button>
        </div>
      )}
    </section>
  );
}
