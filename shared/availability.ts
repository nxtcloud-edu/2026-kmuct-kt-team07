import type { Catalog } from "./domain.js";
type Offer = Catalog["offers"][number];
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
    { in_stock: 0, unknown: 2, out_of_stock: 4, unavailable: 6 }[stock] +
    (offer.market === "domestic" ? 0 : 1)
  );
}
