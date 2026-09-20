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
};

/** Groups the existing category values without changing the request contract. */
export default function CategoryPicker({
  value,
  onChange,
  disabled,
  productGroup,
}: Props) {
  const id = useId();
  const [group, setGroup] = useState<ProductGroup>(productGroup ?? "drinkware");
  useEffect(() => {
    if (productGroup) setGroup(productGroup);
  }, [productGroup]);
  const options = groupCategories[group];
  const visibleCategories = options.includes(value)
    ? options
    : [value, ...options];
  return (
    <div className="category-picker">
      {!productGroup && (
        <label className="group-select" htmlFor={id}>
          <span className="field-label">물건 종류</span>
          <select
            id={id}
            value={group}
            disabled={disabled}
            onChange={(e) => {
              const next = e.target.value as ProductGroup;
              setGroup(next);
              if (!groupCategories[next].includes(value))
                onChange(groupCategories[next][0]!);
            }}
          >
            <option value="drinkware">{productGroups.drinkware}</option>
            {Object.entries(productGroups)
              .filter(([key]) => key !== "drinkware")
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
      </div>
    </div>
  );
}
