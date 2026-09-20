import { readFileSync } from "node:fs";
import { catalogSchema, type Catalog } from "../shared/domain.js";
import type { CatalogProduct } from "../shared/catalog-search.js";
import { reviewEvidence } from "./resolver.js";
import { offerAvailability, offerLinkUsable } from "../shared/availability.js";
import { productKind } from "../shared/product-kind.js";

export function catalogProducts(catalog: Catalog): CatalogProduct[] {
  return catalog.products.map((product) => {
    const applicable = catalog.parts.filter((part) => {
      const evidence = catalog.evidence.filter(
        (e) => e.variantId === product.variantId && e.partId === part.partId,
      );
      return ["source_supported", "check_required"].includes(
        reviewEvidence(evidence).status,
      );
    });
    return {
      ...product,
      kind: productKind(product).kind,
      availableCategories: [...new Set(applicable.map((p) => p.category))],
      orderableCategories: [
        ...new Set(
          applicable
            .filter((p) =>
              catalog.offers.some(
                (o) =>
                  o.partId === p.partId &&
                  o.market === "domestic" &&
                  offerLinkUsable(o) &&
                  offerAvailability(o).stock === "in_stock",
              ),
            )
            .map((p) => p.category),
        ),
      ],
      domesticCategories: [
        ...new Set(
          applicable
            .filter((p) =>
              catalog.offers.some(
                (o) =>
                  o.partId === p.partId &&
                  o.market === "domestic" &&
                  offerLinkUsable(o) &&
                  o.stock !== "unavailable",
              ),
            )
            .map((p) => p.category),
        ),
      ],
    };
  });
}

export function loadCatalog(path = "data/catalog.json"): Catalog {
  return catalogSchema.parse(JSON.parse(readFileSync(path, "utf8")));
}
