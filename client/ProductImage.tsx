import { useState } from "react";
import { ImageOff } from "lucide-react";
import type { Product } from "../shared/domain";
export default function ProductImage({ product }: { product: Product }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="product-thumbnail">
      {product.image && !failed ? (
        <img
          src={product.image.url}
          alt={product.image.alt}
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="image-unavailable">
          <ImageOff size={22} />
          <small>사진 준비 중</small>
        </span>
      )}
    </div>
  );
}
