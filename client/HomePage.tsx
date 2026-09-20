import { Camera } from "lucide-react";
import type { CatalogProduct } from "../shared/catalog-search";
import SearchBox from "./SearchBox";

/** Step 1. One question on the page: which product is it? */
export default function HomePage({
  products,
  ready,
  busy,
  query,
  onQuery,
  onSubmit,
  onPick,
  onPhoto,
  onBrowse,
}: {
  products: CatalogProduct[];
  ready: boolean;
  busy: boolean;
  query: string;
  onQuery: (value: string) => void;
  onSubmit: () => void;
  onPick: (product: CatalogProduct) => void;
  onPhoto: () => void;
  onBrowse: () => void;
}) {
  return (
    <section className="home" aria-labelledby="page-title">
      <h1 id="page-title" tabIndex={-1}>
        딱 맞는 부품부터
      </h1>
      <p className="home-lead">
        제품 이름이나 사진만 알려 주세요.
        <br />살 수 있는 곳까지 찾아 드려요.
      </p>
      <SearchBox
        products={products}
        value={query}
        onChange={onQuery}
        onSubmit={onSubmit}
        onPick={onPick}
        disabled={busy || !ready}
      />
      <p className="home-or">
        <span>이름을 모르겠다면</span>
      </p>
      <button
        className="photo-entry"
        disabled={busy || !ready}
        onClick={onPhoto}
      >
        <Camera size={22} aria-hidden="true" />
        사진으로 찾기
      </button>
      <button
        className="text-button home-browse"
        disabled={busy || !ready}
        onClick={onBrowse}
      >
        등록된 제품 둘러보기
      </button>
    </section>
  );
}
