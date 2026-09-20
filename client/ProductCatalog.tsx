import { useState } from "react";
import { ArrowUpRight, Search } from "lucide-react";
import {
  categories,
  productGroups,
  type ProductGroup,
  type Category,
} from "../shared/domain";
import {
  filterProducts,
  interleaveProductGroups,
  matchesProduct,
  type CatalogProduct,
} from "../shared/catalog-search";
import ProductImage from "./ProductImage";
import { displayUrl, external } from "./labels";

const PAGE = 8;

/**
 * Product list for "어떤 제품인가요?": likely products first, one search box, and
 * each row carries the photo and the source page so a model can be recognised.
 */
export default function ProductCatalog({
  products,
  category,
  candidateIds = [],
  candidateLabel = "입력한 모델과 일치",
  bestId = null,
  reasons = {},
  initialQuery = "",
  busy,
  onSelect,
}: {
  products: CatalogProduct[];
  category: Category;
  candidateIds?: string[];
  candidateLabel?: string;
  bestId?: string | null;
  reasons?: Record<string, string[]>;
  initialQuery?: string;
  busy: boolean;
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState(
    products.some((p) => matchesProduct(p, initialQuery)) ? initialQuery : "",
  );
  const [group, setGroup] = useState<ProductGroup | "">("");
  const [brand, setBrand] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [showAll, setShowAll] = useState(false);
  const scoped = products.filter((p) => !group || p.group === group);
  const brands = [...new Set(scoped.map((p) => p.brand))];
  const filtering = Boolean(query.trim() || group || brand);
  // Until the user searches, a photo or a typed model decides what is shown.
  const suggested = !filtering && !showAll && candidateIds.length > 0;
  const withPart = filterProducts(products, query, {
    group: group || undefined,
    brand,
    category: category === "other" ? undefined : category,
  });
  // A part the catalog lacks must not make the product itself unfindable.
  const matched = (
    withPart.length
      ? withPart
      : filterProducts(products, query, { group: group || undefined, brand })
  )
    .filter((p) => !suggested || candidateIds.includes(p.variantId))
    .sort((a, b) => {
      const order = (p: CatalogProduct) =>
        candidateIds.includes(p.variantId)
          ? candidateIds.indexOf(p.variantId)
          : 9999;
      return (
        order(a) - order(b) ||
        Number(Boolean(b.image)) - Number(Boolean(a.image))
      );
    });
  const ordered =
    !filtering && !suggested ? interleaveProductGroups(matched) : matched;
  const reset = () => {
    setQuery("");
    setGroup("");
    setBrand("");
    setLimit(PAGE);
  };
  return (
    <div className="catalog">
      <label className="search-field">
        <Search size={20} aria-hidden="true" />
        <input
          aria-label="제품 검색"
          value={query}
          maxLength={120}
          placeholder="검색어를 입력해주세요"
          onChange={(e) => {
            setQuery(e.target.value);
            setLimit(PAGE);
          }}
        />
      </label>
      <div className="catalog-narrow">
        <select
          aria-label="물건 종류"
          value={group}
          onChange={(e) => {
            setGroup(e.target.value as ProductGroup | "");
            setBrand("");
            setLimit(PAGE);
          }}
        >
          <option value="">모든 종류</option>
          {Object.entries(productGroups)
            .filter(([key]) => products.some((p) => p.group === key))
            .map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
        </select>
        <select
          aria-label="브랜드"
          value={brand}
          onChange={(e) => {
            setBrand(e.target.value);
            setLimit(PAGE);
          }}
        >
          <option value="">모든 브랜드</option>
          {brands.map((b) => (
            <option key={b}>{b}</option>
          ))}
        </select>
      </div>
      <p className="catalog-count" aria-live="polite">
        {suggested
          ? `${candidateLabel} ${matched.length}개`
          : `제품 ${matched.length}개`}
      </p>
      <ul className="product-list">
        {ordered.slice(0, limit).map((p) => {
          const candidate = candidateIds.includes(p.variantId);
          const url = p.image?.sourceUrl ?? p.source.url;
          return (
            <li
              className={`product-row${candidate ? " candidate" : ""}`}
              key={p.variantId}
            >
              <ProductImage product={p} />
              <div className="product-row-body">
                {candidate && (
                  <span className="candidate-label">
                    {p.variantId === bestId
                      ? "가장 유력한 후보"
                      : candidateLabel}
                  </span>
                )}
                <strong className="model">{p.modelName}</strong>
                <span className="product-row-meta">
                  {[
                    p.brand,
                    p.series ?? p.kind,
                    // Many model names already carry the capacity.
                    p.capacity && !p.modelName.includes(p.capacity)
                      ? p.capacity
                      : null,
                    p.generation,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
                {candidate && reasons[p.variantId]?.length ? (
                  <span className="product-row-reason">
                    {reasons[p.variantId]!.join(" · ")}
                  </span>
                ) : (
                  <span className="product-row-parts">
                    {p.availableCategories.length
                      ? `찾을 수 있는 부품: ${p.availableCategories.map((k) => categories[k]).join(" · ")}`
                      : "등록된 부품 자료 없음"}
                  </span>
                )}
                <a className="source-url" {...external(url)}>
                  <span>{displayUrl(url)}</span>
                  <ArrowUpRight size={13} />
                </a>
              </div>
              <button
                // One filled button per screen: the likeliest product.
                className={
                  p.variantId === candidateIds[0] ? "primary" : "outline-button"
                }
                disabled={busy}
                onClick={() => onSelect(p.variantId)}
              >
                이 제품이에요
              </button>
            </li>
          );
        })}
      </ul>
      {matched.length === 0 && (
        <div className="empty">
          <p>조건에 맞는 제품을 찾지 못했어요.</p>
          <button className="text-button" onClick={reset}>
            검색 조건 지우기
          </button>
        </div>
      )}
      {matched.length > limit && (
        <button
          className="outline-button wide"
          onClick={() => setLimit(limit + PAGE)}
        >
          더 보기 ({Math.min(limit, matched.length)} / {matched.length})
        </button>
      )}
      {suggested && (
        <button
          className="text-button"
          onClick={() => {
            setShowAll(true);
            setLimit(PAGE);
          }}
        >
          여기에 없어요 · 전체 제품에서 찾기
        </button>
      )}
    </div>
  );
}
