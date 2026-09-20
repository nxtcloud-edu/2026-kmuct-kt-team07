import { useId, useRef, useState } from "react";
import { categories, type Category } from "../shared/domain";
import { searchIntent } from "../shared/search-intent";

const options = (Object.entries(categories) as [Category, string][]).filter(
  ([key]) => key !== "other",
);
const squash = (value: string) => value.replace(/[\s·]/gu, "").toLowerCase();

/** "어떤 부품을 찾으세요?" — free text that offers the part names the catalog knows. */
export default function PartField({
  value,
  onChange,
  onEnter,
}: {
  value: string;
  onChange: (value: string) => void;
  onEnter?: () => void;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const box = useRef<HTMLDivElement>(null);
  const typed = squash(value);
  const known = searchIntent(value).category !== "other";
  const matches = open
    ? options.filter(([, label]) => !typed || squash(label).includes(typed))
    : [];
  // A finished choice needs no list under it.
  const shown =
    matches.length === 1 && squash(matches[0]![1]) === typed ? [] : matches;
  return (
    <div
      className="part-field"
      ref={box}
      onBlur={(e) => {
        if (!box.current?.contains(e.relatedTarget)) setOpen(false);
      }}
    >
      <label htmlFor={id}>
        어떤 부품을 찾으세요? <span className="optional">선택 사항</span>
      </label>
      <input
        id={id}
        role="combobox"
        aria-expanded={shown.length > 0}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${id}-${active}` : undefined}
        autoComplete="off"
        value={value}
        maxLength={80}
        placeholder="검색어를 입력해주세요"
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
          if (e.key === "Enter") {
            e.preventDefault();
            if (active >= 0 && shown[active]) {
              onChange(shown[active][1]);
              setOpen(false);
            } else onEnter?.();
          }
          if (!shown.length) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((active + 1) % shown.length);
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive(active <= 0 ? shown.length - 1 : active - 1);
          }
        }}
      />
      {shown.length > 0 && (
        <ul
          className="part-options"
          id={`${id}-list`}
          role="listbox"
          onMouseDown={(e) => e.preventDefault()}
        >
          {shown.map(([key, label], i) => (
            <li
              key={key}
              id={`${id}-${i}`}
              role="option"
              aria-selected={i === active}
            >
              <button
                tabIndex={-1}
                className={i === active ? "active" : undefined}
                onMouseEnter={() => setActive(i)}
                onClick={() => {
                  onChange(label);
                  setOpen(false);
                }}
              >
                {label}
              </button>
            </li>
          ))}
        </ul>
      )}
      {value.trim() && !known && !shown.length && (
        <small className="field-note">
          등록된 부품 이름이 아니에요. 입력한 이름 그대로 함께 찾아볼게요.
        </small>
      )}
    </div>
  );
}
