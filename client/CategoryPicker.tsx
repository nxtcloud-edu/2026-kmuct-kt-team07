import { useEffect, useId, useState } from "react";
import {
  categories,
  groupCategories,
  productGroups,
  type Category,
  type ProductGroup,
} from "../shared/domain";

type Props = {
  value: Category;
  onChange: (category: Category) => void;
  disabled?: boolean;
  productGroup?: ProductGroup;
  onGroupChange?: (group: ProductGroup) => void;
};

/** Groups the existing category values without changing the request contract. */
export default function CategoryPicker({
  value,
  onChange,
  disabled,
  productGroup,
  onGroupChange,
}: Props) {
  const id = useId();
  const [group, setGroup] = useState<ProductGroup>(productGroup ?? "household");
  useEffect(() => {
    if (productGroup) setGroup(productGroup);
  }, [productGroup]);
  const options = [...new Set([...groupCategories[group], "other" as const])];
  const visibleCategories = options.includes(value)
    ? options
    : [value, ...options];
  return (
    <div className="category-picker">
      {(!productGroup || onGroupChange) && (
        <label className="group-select" htmlFor={id}>
          <span className="field-label">물건 종류</span>
          <select
            id={id}
            value={group}
            disabled={disabled}
            onChange={(e) => {
              const next = e.target.value as ProductGroup;
              setGroup(next);
              onGroupChange?.(next);
              if (!groupCategories[next].includes(value))
                onChange(groupCategories[next][0]!);
            }}
          >
            <option value="household">
              전체 생활용품 · 종류를 골라 주세요
            </option>
            {Object.entries(productGroups)
              .filter(([key]) => key !== "household")
              .map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
          </select>
        </label>
      )}
      <div className="category-field">
        <span className="field-label">필요한 부품</span>
        {group === "household" ? (
          <select
            aria-label="필요한 부품"
            value={value}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value as Category)}
          >
            <option value="other">기타 부품 · 이름으로 찾기</option>
            {Object.entries(categories)
              .filter(([key]) => key !== "other")
              .map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
          </select>
        ) : (
          <div className="chips" role="group" aria-label="필요한 부품">
            {visibleCategories.map((key) => (
              <button
                key={key}
                disabled={disabled}
                aria-pressed={value === key}
                className={value === key ? "selected" : ""}
                onClick={() => onChange(key)}
              >
                {categories[key]}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
