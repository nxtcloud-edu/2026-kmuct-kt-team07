import { useState } from "react";
import type { Product } from "../shared/domain";
import { productKind } from "../shared/product-kind";

/** The product photo, or a plain tile naming the product type when there is none. */
export default function ProductImage({ product }: { product: Product }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="product-thumbnail">
      {product.image && !failed ? (
        <img
          src={product.image.url}
          alt={product.image.alt}
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="no-image" aria-hidden="true">
          {productKind(product).kind}
        </span>
      )}
    </span>
  );
}
