/**
 * The selling name printed on the official page ("블루스카이 3000", "에어로타워").
 * Only for makers whose page titles were reviewed; anything else stays unnamed
 * rather than carrying a store slogan into the catalog.
 */
export function seriesFromTitle(
  brand: string,
  modelName: string,
  title: string,
) {
  if (!["LG", "삼성", "다이슨", "써모스"].includes(brand)) return undefined;
  const code = modelName.split(/[\s.]/u)[0]!;
  let name = title.split("|")[0]!.split(" - ")[0]!;
  if (brand === "삼성") name = name.split(/\(?\s*\d+\s*㎡/u)[0]!;
  name = name
    .replace(/\[[^\]]*\]/gu, " ")
    // Colours "(화이트/골드)" and codes "(FHL-400K)" are not part of the name.
    .replace(/\([^)]*[/][^)]*\)/gu, " ")
    .replace(/\(\s*[A-Z0-9][A-Z0-9/.-]*\s*\)/gu, " ")
    .replace(/\d+(?:\.\d+)?\s*(?:ml|mL|L|l|리터)(?![A-Za-z])/gu, " ")
    .split(code)
    .join(" ")
    .replace(/^\s*(?:LG전자|LG|다이슨|써모스|삼성전자|삼성)\s*/u, "")
    .replace(/\s+/gu, " ")
    .trim();
  // Dyson vacuums are already named by their series ("V12 오리진 플러피 청소기").
  if (brand === "다이슨" && !name.includes("공기청정기")) return undefined;
  return name.length >= 2 && name.length <= 80 ? name : undefined;
}
