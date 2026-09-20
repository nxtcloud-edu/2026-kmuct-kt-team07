import ProductImage from "./ProductImage";
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

export default function ProductCatalog({
  products,
  category,
  candidateIds = [],
  candidateLabel = "입력 정보 일치",
  initialQuery = "",
  initialGroup,
  busy,
  onSelect,
}: {
  products: CatalogProduct[];
  category: Category;
  candidateIds?: string[];
  candidateLabel?: string;
  initialQuery?: string;
  initialGroup?: ProductGroup;
  busy: boolean;
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState(
    products.some((p) => matchesProduct(p, initialQuery)) ? initialQuery : "",
  );
  const [group, setGroup] = useState<ProductGroup | "">(
    initialGroup === "household" ? "" : (initialGroup ?? ""),
  );
  const [brand, setBrand] = useState("");
  const [capacity, setCapacity] = useState("");
  const [domesticOnly, setDomesticOnly] = useState(false);
  const [partsOnly, setPartsOnly] = useState(false);
  const [orderableOnly, setOrderableOnly] = useState(false);
  const [suggestedOnly, setSuggestedOnly] = useState(candidateIds.length > 0);
  const [limit, setLimit] = useState(8);
  const [toolsOpen, setToolsOpen] = useState(false);
  const scoped = products.filter((p) => !group || p.group === group);
  const brands = [...new Set(scoped.map((p) => p.brand))];
  const capacities = [
    ...new Set(
      scoped
        .filter((p) => !brand || p.brand === brand)
        .map((p) => p.capacity)
        .filter((c): c is string => Boolean(c)),
    ),
  ].sort((a, b) => a.localeCompare(b, "ko", { numeric: true }));
  const scopedCategory = category === "other" ? undefined : category;
  const categoryLabel = scopedCategory ? categories[scopedCategory] + " " : "";
  const matched = filterProducts(products, query, {
    group: group || undefined,
    brand,
    capacity,
    category:
      partsOnly || domesticOnly || orderableOnly ? scopedCategory : undefined,
    domesticOnly,
    orderableOnly,
  })
    .filter((p) => !partsOnly || p.availableCategories.length > 0)
    .filter((p) => !suggestedOnly || candidateIds.includes(p.variantId))
    .sort(
      (a, b) =>
        (candidateIds.includes(a.variantId)
          ? candidateIds.indexOf(a.variantId)
          : 9999) -
          (candidateIds.includes(b.variantId)
            ? candidateIds.indexOf(b.variantId)
            : 9999) ||
        Number(b.domesticCategories.length > 0) -
          Number(a.domesticCategories.length > 0),
    );
  const ordered =
    !group && !query.trim() && !suggestedOnly
      ? interleaveProductGroups(matched)
      : matched;
  function reset() {
    setQuery("");
    setGroup("");
    setBrand("");
    setCapacity("");
    setDomesticOnly(false);
    setPartsOnly(false);
    setOrderableOnly(false);
    setSuggestedOnly(false);
    setLimit(8);
  }
  const activeFilters = [
    group,
    brand,
    capacity,
    domesticOnly,
    partsOnly,
    orderableOnly,
  ].filter(Boolean).length;
  const tools = (
    <>
      <label className="search-field">
        <Search size={18} />
        <input
          aria-label="등록 제품 검색"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setLimit(8);
          }}
          placeholder="검색어를 입력해주세요"
          maxLength={120}
        />
      </label>
      <details className="catalog-refine">
        <summary>
          필터
          {activeFilters > 0 && <span>{activeFilters}개 적용 중</span>}
        </summary>
        <div className="catalog-filters">
          <label>
            물건 종류
            <select
              value={group}
              onChange={(e) => {
                setGroup(e.target.value as ProductGroup | "");
                setBrand("");
                setCapacity("");
                setLimit(8);
              }}
            >
              <option value="">전체 생활용품</option>
              {Object.entries(productGroups).map(([key, label]) => (
                <option key={key} value={key}>
                  {label} ({products.filter((p) => p.group === key).length})
                </option>
              ))}
            </select>
          </label>
          <label>
            브랜드
            <select
              value={brand}
              onChange={(e) => {
                setBrand(e.target.value);
                setCapacity("");
                setLimit(8);
              }}
            >
              <option value="">전체 브랜드</option>
              {brands.map((b) => (
                <option key={b}>{b}</option>
              ))}
            </select>
          </label>
          {capacities.length > 0 && (
            <label>
              용량
              <select
                value={capacity}
                onChange={(e) => {
                  setCapacity(e.target.value);
                  setLimit(8);
                }}
              >
                <option value="">전체 용량</option>
                {capacities.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
          )}
        </div>
        <div className="catalog-toggles">
          {candidateIds.length > 0 && (
            <label>
              <input
                type="checkbox"
                checked={suggestedOnly}
                onChange={(e) => {
                  setSuggestedOnly(e.target.checked);
                  setLimit(8);
                }}
              />
              사진·입력 후보만 보기
            </label>
          )}
          <label>
            <input
              type="checkbox"
              checked={orderableOnly}
              onChange={(e) => {
                setOrderableOnly(e.target.checked);
                setLimit(8);
              }}
            />
            {categoryLabel}최근 주문 가능 확인 · 국내
          </label>
          <label>
            <input
              type="checkbox"
              checked={domesticOnly}
              onChange={(e) => {
                setDomesticOnly(e.target.checked);
                setLimit(8);
              }}
            />
            {categoryLabel}국내 구매 경로 있는 제품
          </label>
          <label>
            <input
              type="checkbox"
              checked={partsOnly}
              onChange={(e) => {
                setPartsOnly(e.target.checked);
                setLimit(8);
              }}
            />
            {categoryLabel}부품 자료 있는 제품
          </label>
        </div>
      </details>
    </>
  );
  return (
    <div className="catalog-browser">
      {tools}
      {candidateIds.length > 0 && (
        <button
          className="text-button"
          onClick={() => {
            setSuggestedOnly(!suggestedOnly);
            setLimit(8);
          }}
        >
          {suggestedOnly ? "전체 제품에서 다시 찾기" : "추천 후보만 보기"}
        </button>
      )}
      <p className="catalog-count" aria-live="polite">
        {matched.length}개 제품 · 모델·규격이 맞는지 확인 후 선택하세요.
      </p>
      <div className="product-options">
        {ordered.slice(0, limit).map((p) => (
          <div
            className={`product-option${candidateIds.includes(p.variantId) ? " candidate" : ""}`}
            key={p.variantId}
          >
            <ProductImage product={p} />
            <div className="product-option-body">
              <strong>
                {p.modelName}
                <span className="product-spec">
                  {[
                    // Many model names already carry the capacity.
                    p.capacity
                      ? p.modelName.includes(p.capacity)
                        ? null
                        : p.capacity
                      : p.group === "drinkware"
                        ? "용량 확인 필요"
                        : null,
                    p.generation,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </strong>
              <small>
                {candidateIds.includes(p.variantId) && (
                  <span className="candidate-label">{candidateLabel}</span>
                )}
                {productGroups[p.group]} · {p.brand}
              </small>
              <span className="coverage-label">
                {p.availableCategories.map((k) => categories[k]).join(" · ") ||
                  "부품 확인 필요"}
              </span>
              <a href={p.source.url} target="_blank" rel="noopener noreferrer">
                제품 정보 보기
                <ArrowUpRight size={13} />
                <span className="source-url">
                  {new URL(p.source.url).hostname}
                </span>
              </a>
            </div>
            <button
              className={
                candidateIds.includes(p.variantId)
                  ? "primary"
                  : "outline-button"
              }
              disabled={busy}
              onClick={() => onSelect(p.variantId)}
            >
              이 제품 선택
            </button>
          </div>
        ))}
      </div>
      {matched.length === 0 && (
        <div className="empty">
          <p>
            조건에 맞는 등록 제품이 없어요. 필터를 바꾸거나 모델명으로 검색·문의
            경로를 확인하세요.
          </p>
          <button className="text-button" onClick={reset}>
            필터 초기화
          </button>
        </div>
      )}
      {matched.length > limit && (
        <button
          className="outline-button catalog-more"
          onClick={() => setLimit(limit + 8)}
        >
          제품 더 보기 ({Math.min(limit, matched.length)} / {matched.length})
        </button>
      )}
      <p className="catalog-note">
        부품 자료는 제조사·판매처의 적용 안내를 바탕으로 합니다. 국내 구매 경로
        표시는 재고를 보장하지 않으며, 판매 페이지에서 옵션을 확인해야 합니다.
      </p>
    </div>
  );
}
