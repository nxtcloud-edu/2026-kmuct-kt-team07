// Catalog discovery helpers; never manufacture model codes or compatibility.
export const brandAliases: Record<string, string[]> = {
  부가부: ["부가부", "BUGABOO"],
  싱거: ["싱거", "싱어", "SINGER"],
  데카트론: ["데카트론", "DECATHLON", "FORCLAZ", "포클라즈", "QUECHUA", "퀘차"],
  톰보우: ["톰보우", "톰보", "TOMBOW"],
  시마노: ["시마노", "SHIMANO"],
  다이슨: ["다이슨", "DYSON"],
  이케아: ["이케아", "IKEA"],
  유니: ["유니", "UNI", "uni-ball", "미쓰비시", "MITSUBISHI"],
  브리타: ["브리타", "BRITA"],
  필립스: ["필립스", "PHILIPS", "Sonicare", "소닉케어"],
  올파: ["올파", "OLFA"],
  가데나: ["가데나", "GARDENA"],
  펫세이프: ["펫세이프", "PetSafe", "Drinkwell", "드링크웰"],
  Nalgene: ["Nalgene", "날진"],
  "Hydro Flask": ["Hydro Flask", "하이드로플라스크"],
  써모스: ["써모스", "THERMOS"],
  킨토: ["킨토", "KINTO"],
  조지루시: ["조지루시", "ZOJIRUSHI"],
};

export function capacityKey(text: string): string | null {
  const match = text
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .match(/^(\d+(?:\.\d+)?)\s*(ml|l|밀리리터|리터|fl\s*oz|oz|온스)$/u);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0) return null;
  const unit = match[2];
  return unit === "l" || unit === "리터"
    ? `${Number((value * 1000).toFixed(6))}ml`
    : `${value}${unit === "ml" || unit === "밀리리터" ? "ml" : "oz"}`;
}
