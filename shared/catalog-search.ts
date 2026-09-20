import { searchIntent } from "./search-intent.js";
import type { Category, Product, ProductGroup } from "./domain.js";
import { brandAliases, capacityKey } from "./product-identity.js";
import { productKind } from "./product-kind.js";

export type CatalogProduct = Product & {
  /** Everyday product type for display and discovery, e.g. "공기청정기". */
  kind: string;
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
    product.description,
    product.capacity ?? "",
    product.generation ?? "",
    ...product.aliases,
    // "삼성 공기청정기" must find models whose names are only codes.
    productKind(product).kind,
    ...productKind(product).words,
  ].map(normalize);
  const normalizedQuery = searchIntent(query).productQuery.normalize("NFKC");
  // A volume is an exact constraint: 50ml must not match 350ml or 500ml.
  const volumePattern =
    /(?<![\p{L}\d.])(\d+(?:\.\d+)?)\s*(밀리리터|리터|fl\s*oz|ml|oz|온스|l)(?![\p{L}\d])/giu;
  const volumes = [...normalizedQuery.matchAll(volumePattern)];
  if (
    volumes.some(
      (v) =>
        !product.capacity ||
        capacityKey(v[0]) !== capacityKey(product.capacity),
    )
  )
    return false;
  return normalizedQuery
    .replace(volumePattern, " ")
    .trim()
    .split(/\s+/u)
    .filter(Boolean)
    .every((term) => fields.some((field) => field.includes(normalize(term))));
}

export function filterProducts(
  products: CatalogProduct[],
  query: string,
  filters: {
    group?: ProductGroup;
    brand?: string;
    capacity?: string;
    category?: Category;
    domesticOnly?: boolean;
    orderableOnly?: boolean;
  } = {},
) {
  const intent = searchIntent(query, filters.category);
  const requestedCategory =
    filters.category ??
    (intent.category === "other" ? undefined : intent.category);
  return products.filter(
    (p) =>
      matchesProduct(p, query) &&
      (!filters.group || p.group === filters.group) &&
      (!filters.brand || p.brand === filters.brand) &&
      (!filters.capacity ||
        (p.capacity &&
          (capacityKey(filters.capacity)
            ? capacityKey(p.capacity) === capacityKey(filters.capacity)
            : p.capacity === filters.capacity))) &&
      (!requestedCategory ||
        p.availableCategories.includes(requestedCategory)) &&
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

/** Keep the initial discovery page useful even when one group has many more models. */
export function interleaveProductGroups(
  products: CatalogProduct[],
): CatalogProduct[] {
  const groups = new Map<string, CatalogProduct[]>();
  for (const p of products)
    groups.set(p.group, [...(groups.get(p.group) ?? []), p]);
  const result: CatalogProduct[] = [];
  const buckets = [...groups.values()];
  for (let index = 0; buckets.some((items) => index < items.length); index++) {
    for (const items of buckets) if (items[index]) result.push(items[index]!);
  }
  return result;
}

/**
 * Orders matches for a search box: the typed model code first, then models that
 * start with it, then products whose photo helps the user recognise them.
 */
export function suggestProducts(
  products: CatalogProduct[],
  query: string,
  limit = 6,
): CatalogProduct[] {
  const typed = normalize(searchIntent(query).productQuery);
  if (!typed) return [];
  const rank = (p: CatalogProduct) => {
    const names = [p.modelName, ...p.aliases].map(normalize);
    return names.includes(typed)
      ? 0
      : names.some((n) => n.startsWith(typed))
        ? 1
        : names.some((n) => n.includes(typed))
          ? 2
          : 3;
  };
  // A part the catalog lacks for this product must not hide the product itself.
  const withPart = filterProducts(products, query);
  return (
    withPart.length
      ? withPart
      : products.filter((p) => matchesProduct(p, query))
  )
    .map((p, index) => ({ p, index, rank: rank(p) }))
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        Number(Boolean(b.p.image)) - Number(Boolean(a.p.image)) ||
        a.index - b.index,
    )
    .slice(0, limit)
    .map((x) => x.p);
}
