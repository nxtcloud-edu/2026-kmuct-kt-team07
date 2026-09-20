import { useId, useRef, useState } from "react";
import { ArrowUpRight, Search } from "lucide-react";
import { categories } from "../shared/domain";
import { suggestProducts, type CatalogProduct } from "../shared/catalog-search";
import { searchIntent } from "../shared/search-intent";
import ProductImage from "./ProductImage";
import { displayUrl, external } from "./labels";

/**
 * The home search: as the user types, matching products appear with their photo
 * and the page the data came from, so a model can be recognised before choosing.
 */
export default function SearchBox({
  products,
  value,
  onChange,
  onSubmit,
  onPick,
  disabled,
  autoFocus,
}: {
  products: CatalogProduct[];
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onPick: (product: CatalogProduct) => void;
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const box = useRef<HTMLDivElement>(null);
  const suggestions = open ? suggestProducts(products, value, 6) : [];
  const intent = searchIntent(value);
  const part = intent.category === "other" ? "" : categories[intent.category];
  return (
    <div
      className="search-box"
      ref={box}
      onBlur={(e) => {
        if (!box.current?.contains(e.relatedTarget)) setOpen(false);
      }}
    >
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          if (active >= 0 && suggestions[active]) onPick(suggestions[active]);
          else if (value.trim()) onSubmit();
          setOpen(false);
        }}
      >
        <Search size={22} aria-hidden="true" />
        <input
          role="combobox"
          aria-label="제품 검색"
          aria-expanded={suggestions.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={
            active >= 0 ? `${listId}-${active}` : undefined
          }
          autoFocus={autoFocus}
          autoComplete="off"
          enterKeyHint="search"
          value={value}
          maxLength={120}
          placeholder="검색어를 입력해주세요"
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
            if (!suggestions.length) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((active + 1) % suggestions.length);
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive(active <= 0 ? suggestions.length - 1 : active - 1);
            }
          }}
        />
        <button className="primary" disabled={disabled || !value.trim()}>
          찾기
        </button>
      </form>
      {suggestions.length > 0 && (
        <ul
          className="suggestions"
          id={listId}
          role="listbox"
          // Keep focus in the input so the list survives until the click lands.
          onMouseDown={(e) => e.preventDefault()}
        >
          {suggestions.map((p, i) => (
            <li
              key={p.variantId}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={i === active ? "active" : undefined}
            >
              <button
                className="suggestion"
                disabled={disabled}
                tabIndex={-1}
                onMouseEnter={() => setActive(i)}
                onClick={() => {
                  setOpen(false);
                  onPick(p);
                }}
              >
                <ProductImage product={p} />
                <span className="suggestion-text">
                  <strong>{p.modelName}</strong>
                  <small>
                    {p.brand} · {p.kind}
                    {part &&
                      (p.availableCategories.includes(intent.category)
                        ? ` · ${part} 있음`
                        : ` · ${part} 자료 없음`)}
                  </small>
                  <small className="source-url">
                    {displayUrl(p.image?.sourceUrl ?? p.source.url)}
                  </small>
                </span>
              </button>
              <a
                className="suggestion-link"
                tabIndex={-1}
                aria-label={`${p.modelName} 제품 페이지 열기`}
                {...external(p.image?.sourceUrl ?? p.source.url)}
              >
                <ArrowUpRight size={18} />
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
