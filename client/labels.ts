export const roleLabels = {
  full: "제품 전체",
  part: "부품·장착부",
  label: "모델명 라벨",
} as const;
export const qualityLabels: Record<string, string> = {
  blurry: "사진이 흐려요",
  glare: "빛 반사가 있어요",
  subject_too_small: "대상이 작게 보여요",
  label_cropped: "라벨 일부가 잘렸어요",
  label_missing: "모델명 라벨이 없어요",
  personal_info_visible: "개인정보가 보여요",
  other: "추가 확인이 필요해요",
};
export const featureLabels: Record<string, string> = {
  product_type: "제품 종류",
  appearance: "외형",
  lid_connection: "결합 방식",
  lid_type: "뚜껑 형태",
  gasket_cross_section: "패킹 단면",
  has_straw: "빨대",
  has_handle: "손잡이",
  ruler_visible: "자",
  other: "특징",
};
export const reviewLabels: Record<string, string> = {
  source_supported: "적용 대상에 명시됨",
  check_required: "세부 조건 확인 필요",
  unverified: "적용 근거 미확인",
  conflict: "근거가 서로 달라요",
  excluded: "적용 제외",
};
/** One-word verdicts; the full wording always sits beside them. */
export const verdictWords: Record<string, string> = {
  source_supported: "명시됨",
  check_required: "조건 확인",
  unverified: "미확인",
  conflict: "근거 충돌",
  excluded: "제외",
};
export const originLabels: Record<string, string> = {
  oem: "정품 부품",
  aftermarket: "타사 대체품",
  generic: "범용 부품",
  unknown: "출처 미확인 부품",
};
export const external = (url: string) => ({
  href: url,
  target: "_blank",
  rel: "noopener noreferrer",
});
/** "필터를" / "패킹을": the object particle follows the final consonant. */
export function withObjectParticle(word: string) {
  const last = word.charCodeAt(word.length - 1);
  if (last < 0xac00 || last > 0xd7a3) return `${word}을(를)`;
  return `${word}${(last - 0xac00) % 28 ? "을" : "를"}`;
}
/** Shows where a link leads without printing a long tracking URL. */
export function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./u, "");
  } catch {
    return url;
  }
}
/** The address a person would recognise: host and readable path, no query. */
export function displayUrl(url: string) {
  try {
    const u = new URL(url);
    let path = u.pathname;
    try {
      path = decodeURI(path);
    } catch {
      /* Keep the encoded form when it is not valid UTF-8. */
    }
    return (u.hostname.replace(/^www\./u, "") + path).replace(/\/$/u, "");
  } catch {
    return url;
  }
}
