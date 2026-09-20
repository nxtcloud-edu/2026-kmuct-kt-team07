// Catalog discovery helpers; never manufacture model codes or compatibility.
export const brandAliases: Record<string, string[]> = {
  Nalgene: ["Nalgene", "날진"],
  "Hydro Flask": ["Hydro Flask", "하이드로플라스크"],
  써모스: ["써모스", "THERMOS"],
  킨토: ["킨토", "KINTO"],
  조지루시: ["조지루시", "ZOJIRUSHI"],
};

export function capacityKey(text: string): string | null {
  const match = text.normalize("NFKC").trim().toLowerCase()
    .match(/^(\d+(?:\.\d+)?)\s*(ml|l|밀리리터|리터|fl\s*oz|oz|온스)$/u);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0) return null;
  const unit = match[2];
  return unit === "l" || unit === "리터"
    ? `${Number((value * 1000).toFixed(6))}ml`
    : `${value}${unit === "ml" || unit === "밀리리터" ? "ml" : "oz"}`;
}
