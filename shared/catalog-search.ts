import type { Category, Product } from "./domain.js";
import { brandAliases, capacityKey } from "./product-identity.js";

export type CatalogProduct = Product & {
  availableCategories: Category[];
  domesticCategories: Category[];
  orderableCategories: Category[];
};

// Discovery only. OCR identification continues to use exact catalog aliases.
const normalize = (value: string) =>
  value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[\s\-‐‑‒–—−]/gu, "");
export function matchesProduct(product: Product, query: string): boolean {
  const fields = [
    product.brand,
    ...(brandAliases[product.brand] ?? []),
    product.modelName,
    product.capacity ?? "",
    product.generation ?? "",
    ...product.aliases,
  ].map(normalize);
  const normalizedQuery = query.normalize("NFKC");
  // A volume is an exact constraint: 50ml must not match 350ml or 500ml.
  const volumePattern = /(?<![\p{L}\d.])(\d+(?:\.\d+)?)\s*(밀리리터|리터|fl\s*oz|ml|oz|온스|l)(?![\p{L}\d])/giu;
  const volumes = [...normalizedQuery.matchAll(volumePattern)];
  if (volumes.some((v) => !product.capacity || capacityKey(v[0]) !== capacityKey(product.capacity))) return false;
  return normalizedQuery.replace(volumePattern, " ")
    .trim()
    .split(/\s+/u)
    .filter(Boolean)
    .every((term) => fields.some((field) => field.includes(normalize(term))));
}

export function filterProducts(
  products: CatalogProduct[],
  query: string,
  filters: {
    brand?: string;
    capacity?: string;
    category?: Category;
    domesticOnly?: boolean;
    orderableOnly?: boolean;
  } = {},
) {
  return products.filter(
    (p) =>
      matchesProduct(p, query) &&
      (!filters.brand || p.brand === filters.brand) &&
      (!filters.capacity || (p.capacity && capacityKey(p.capacity) === capacityKey(filters.capacity))) &&
      (!filters.category || p.availableCategories.includes(filters.category)) &&
      (!filters.orderableOnly ||
        (filters.category
          ? p.orderableCategories.includes(filters.category)
          : p.orderableCategories.length > 0)) &&
      (!filters.domesticOnly ||
        (filters.category
          ? p.domesticCategories.includes(filters.category)
          : p.domesticCategories.length > 0)),
  );
}
