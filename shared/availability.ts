import type { Catalog } from "./domain.js";
type Offer = Catalog["offers"][number];
export function offerLinkUsable(offer: Offer) {
  return !["broken", "redirected"].includes(offer.linkCheck?.status ?? "");
}
export function offerLinkNote(offer: Offer) {
  switch (offer.linkCheck?.status) {
    case "broken":
      return "판매 페이지를 찾지 못했습니다. 아래 다른 구매·문의 경로를 이용해 주세요. 품절이나 단종을 뜻하지 않습니다.";
    case "redirected":
      return "주소가 이동되어 같은 상품인지 재확인이 필요합니다. 아래 다른 구매·문의 경로를 이용해 주세요.";
    case "blocked":
      return "판매처의 접근 제한으로 링크를 자동 확인하지 못했습니다. 직접 상품과 옵션을 확인해 주세요.";
    case "network_error":
      return "연결 오류로 최근 링크 확인을 완료하지 못했습니다. 판매 상태는 확인되지 않았습니다.";
    default:
      return "";
  }
}
// Stock is much more volatile than compatibility evidence. Never keep a positive
// purchase signal indefinitely, and never change compatibility from this signal.
export function offerAvailability(offer: Offer, now = new Date()) {
  const checkedAt = offer.stockCheckedAt ?? offer.source.checkedAt;
  const age = now.getTime() - Date.parse(checkedAt);
  const expired = !Number.isFinite(age) || age < 0 || age > 24 * 60 * 60 * 1000;
  const stock =
    ["in_stock", "out_of_stock"].includes(offer.stock) && expired
      ? "unknown"
      : offer.stock;
  return { stock: stock as Offer["stock"], checkedAt, expired };
}
export function offerPriority(offer: Offer, now = new Date()) {
  const stock = offerAvailability(offer, now).stock;
  return (
    (offerLinkUsable(offer) ? 0 : 20) +
    { in_stock: 0, unknown: 2, out_of_stock: 4, unavailable: 6 }[stock] +
    (offer.market === "domestic" ? 0 : 1)
  );
}
