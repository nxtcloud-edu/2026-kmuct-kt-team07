import { ArrowUpRight, CircleHelp, LoaderCircle } from "lucide-react";
import { categories } from "../shared/domain";
import { matchesProduct, type CatalogProduct } from "../shared/catalog-search";
import { searchIntent } from "../shared/search-intent";
import ProductCatalog from "./ProductCatalog";
import {
  external,
  featureLabels,
  qualityLabels,
  withObjectParticle,
} from "./labels";
import type { RecordResult, WebLookup, WebPart } from "./types";
import { useState } from "react";

/** Step 2. The likeliest products first; the user says which one is theirs. */
export default function ConfirmPage({
  result,
  products,
  busy,
  pollError,
  onSelect,
  onHelp,
  onRetake,
  onWebLookup,
}: {
  result: RecordResult;
  products: CatalogProduct[];
  busy: boolean;
  pollError: string;
  onSelect: (id: string) => void;
  onHelp: () => void;
  onRetake: () => void;
  onWebLookup?: () => Promise<WebLookup>;
}) {
  const [web, setWeb] = useState<WebPart | null | "none">("none");
  const [webBusy, setWebBusy] = useState(false);
  const [webError, setWebError] = useState("");
  const observation =
    result.analysis && "observation" in result.analysis
      ? result.analysis.observation
      : null;
  const byPhoto = result.analysis !== null || result.state !== "ready";
  const part = result.category === "other" ? "" : categories[result.category];
  if (result.state !== "ready")
    return (
      <section className="page" aria-labelledby="page-title">
        <h1 id="page-title" tabIndex={-1}>
          사진을 살펴보고 있어요
        </h1>
        <div className="status-block" role="status">
          <LoaderCircle className="spin" size={24} />
          <p>
            {result.state === "queued"
              ? "분석 순서를 기다리는 중이에요."
              : "제품 종류와 라벨의 글자를 읽는 중이에요."}{" "}
            보통 수십 초가 걸려요. 창을 닫아도 ‘최근 찾기’에서 이어 볼 수
            있어요.
          </p>
        </div>
        {pollError && (
          <div className="alert" role="status">
            {pollError}
          </div>
        )}
      </section>
    );
  const hints = result.photoHints;
  const exact = result.candidates.length > 0;
  const candidateIds = (
    exact ? result.candidates : (hints?.products ?? [])
  ).map((p) => p.variantId);
  const failed =
    result.analysis?.status === "needs_information" &&
    ["provider_error", "invalid_model_output"].includes(result.analysis.reason);
  const conflicting =
    result.analysis?.status === "needs_information" &&
    result.analysis.reason === "conflicting_identity";
  const noMatch =
    !byPhoto &&
    !candidateIds.length &&
    !products.some((p) => matchesProduct(p, result.query));
  const issues = observation?.qualityIssues ?? [];
  // The AI's answer to "what is this?", which is why the photo was uploaded.
  const identified = result.identified ?? hints?.identified ?? null;
  const identifiedName = identified
    ? [identified.brand, identified.modelName || identified.productName]
        .filter(Boolean)
        .join(" ")
    : "";
  // Shown even when nothing in the catalog resembles the photo.
  const guess =
    hints?.guess ||
    [
      observation?.visualHints?.suspectedBrands[0],
      observation?.visualHints?.productFamilyHints[0],
    ]
      .filter(Boolean)
      .join(" ");
  return (
    <section className="page" aria-labelledby="page-title">
      <p className="kicker">
        {byPhoto ? "사진으로 찾기" : `“${result.query}” 검색`}
        {part && <span className="intent-chip">찾는 부품 · {part}</span>}
      </p>
      <h1 id="page-title" tabIndex={-1}>
        {part
          ? `어떤 제품의 ${withObjectParticle(part)} 찾으세요?`
          : "어떤 제품인가요?"}
      </h1>
      {byPhoto && identified && (
        <div className="estimate">
          <p>
            <strong>AI가 사진에서 확인한 제품 · {identifiedName}</strong>
            {identified.confidence === "high"
              ? "모델명까지 확인했어요."
              : identified.confidence === "medium"
                ? "제품군은 맞지만 세부 모델은 갈릴 수 있어요."
                : "짐작한 결과예요. 맞는지 확인해 주세요."}
            {identified.basis === "design_only" &&
              " 라벨 글자가 아니라 생김새로 알아본 것이라 더 확인이 필요해요."}
          </p>
          <a
            className="text-button"
            {...external(
              `https://www.google.com/search?q=${encodeURIComponent(identifiedName)}`,
            )}
          >
            웹에서 “{identifiedName}” 찾아보기
            <ArrowUpRight size={14} />
          </a>
        </div>
      )}
      {byPhoto && !exact && hints && hints.products.length > 0 && (
        <div className="estimate plain">
          <p>
            <strong>라벨의 글자와 맞는 등록 제품이에요</strong>
            {hints.description}
          </p>
        </div>
      )}
      {byPhoto && exact && (
        <p className="page-lead">
          {conflicting
            ? "라벨의 모델 글자와 브랜드·용량 정보가 서로 달라요. 같은 제품의 사진인지 확인하고 골라 주세요."
            : result.candidates.length > 1
              ? "라벨의 글자와 일치하는 제품이 여러 개예요. 용량·세대를 보고 골라 주세요."
              : "라벨의 글자와 일치하는 제품을 찾았어요. 맞으면 선택해 주세요."}
        </p>
      )}
      {byPhoto && !candidateIds.length && !failed && !identified && (
        <div className="estimate plain">
          <p>
            <strong>
              {guess
                ? `사진으로는 ${guess} 정도까지만 보여요`
                : "사진만으로는 제품을 알아보지 못했어요"}
            </strong>
            라벨이 보이게 다시 찍거나, 아래에서 제품 이름으로 찾아 주세요.
          </p>
          {guess && (
            <a
              className="text-button"
              {...external(
                `https://www.google.com/search?q=${encodeURIComponent(guess)}`,
              )}
            >
              웹에서 “{guess}” 찾아보기
              <ArrowUpRight size={14} />
            </a>
          )}
        </div>
      )}
      {byPhoto && identified && !candidateIds.length && (
        <div className="notice">
          <p>
            <strong>{identifiedName}은(는) 등록된 제품이 아니에요.</strong>
            대신 웹에서 이 제품의 {part || "부품"} 정보를 찾아볼 수 있어요.
          </p>
          {onWebLookup && web === "none" && (
            <button
              className="outline-button"
              disabled={webBusy}
              onClick={() => {
                setWebBusy(true);
                setWebError("");
                onWebLookup()
                  .then((r) => setWeb(r.part))
                  .catch((e: Error) =>
                    setWebError(e.message || "웹 조회에 실패했어요."),
                  )
                  .finally(() => setWebBusy(false));
              }}
            >
              {webBusy ? "웹에서 찾는 중…" : "웹에서 부품 찾기"}
            </button>
          )}
          {webError && <p className="alert warning">{webError}</p>}
          {web !== "none" && web === null && (
            <p>웹에서도 부품 정보를 찾지 못했어요.</p>
          )}
          {web !== "none" && web && (
            <div className="web-part">
              {web.partName ? (
                <>
                  <p>
                    <strong>{web.partName}</strong>
                    {web.partNumber && <code>{web.partNumber}</code>}
                  </p>
                  {web.compatibleModels.length > 0 && (
                    <p>호환 표기 · {web.compatibleModels.join(", ")}</p>
                  )}
                </>
              ) : null}
              {web.note && <p>{web.note}</p>}
              <p className="web-caveat">
                웹 페이지에서 그대로 옮긴 내용이에요. 확인해 둔 정보가 아니니
                주문 전에 출처에서 직접 확인해 주세요.
              </p>
              {web.purchases.length > 0 && (
                <div className="web-shops">
                  <p className="web-shops-title">
                    판매처 {web.purchases.length}곳 · 가격을 비교해 보세요
                  </p>
                  <ul>
                    {web.purchases.map((b) => (
                      <li key={b.url}>
                        <a {...external(b.url)}>
                          <span className="shop-seller">
                            {b.seller || "판매처"}
                          </span>
                          {b.title && (
                            <span className="shop-title">{b.title}</span>
                          )}
                          <ArrowUpRight size={14} />
                        </a>
                        {b.snippet && (
                          <span className="shop-snippet">{b.snippet}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                  <p className="web-caveat">
                    가격·재고는 판매처에서 직접 확인해 주세요. 검색 결과를 그대로
                    옮긴 것이라 이미 바뀌었을 수 있어요.
                  </p>
                </div>
              )}
              <p>
                {web.sources.map((x) => (
                  <a key={x.url} className="text-button" {...external(x.url)}>
                    출처 · {x.title.slice(0, 40)}
                    <ArrowUpRight size={14} />
                  </a>
                ))}
              </p>
            </div>
          )}
          <button className="text-button" onClick={onHelp}>
            다른 방법으로 찾기
          </button>
        </div>
      )}
      {failed && (
        <div className="alert warning">
          <CircleHelp size={18} />
          <span>
            사진에서 정보를 읽지 못했어요. 아래에서 제품을 검색하거나 사진을
            다시 올려 주세요.
          </span>
        </div>
      )}
      {noMatch && (
        <div className="notice">
          <p>
            <strong>“{result.query}”와 일치하는 등록 제품이 없어요.</strong>
            아래 전체 제품에서 찾거나, 등록되지 않은 제품이라면 다른 방법으로
            부품을 찾아볼 수 있어요.
          </p>
          <button className="outline-button" onClick={onHelp}>
            다른 방법으로 찾기
          </button>
        </div>
      )}
      <ProductCatalog
        key={result.id}
        products={products}
        category={result.category}
        candidateIds={candidateIds}
        candidateLabel={exact ? "모델명 일치" : "라벨 글자 일치"}
        bestId={exact ? null : (hints?.best ?? null)}
        reasons={exact ? {} : (hints?.reasons ?? {})}
        // The part already narrows the list; the box holds only the product words.
        initialQuery={
          byPhoto || candidateIds.length
            ? ""
            : searchIntent(result.query).productQuery
        }
        busy={busy}
        onSelect={onSelect}
      />
      <div className="page-footer">
        <button className="text-button" onClick={onHelp}>
          내 제품이 목록에 없어요
        </button>
        {byPhoto && (
          <button className="text-button" onClick={onRetake}>
            사진 다시 올리기
          </button>
        )}
      </div>
      {observation && (
        <details className="observation">
          <summary>사진에서 읽은 내용 보기</summary>
          <div className="observation-body">
            {issues.length > 0 && (
              <p>
                {issues.map((q) => (
                  <span className="tag" key={q}>
                    {qualityLabels[q]}
                  </span>
                ))}
              </p>
            )}
            {observation.extractedTexts.map((t, i) => (
              <p key={`t${i}`}>
                <code>{t.text}</code>{" "}
                <small>
                  {t.legibility === "uncertain"
                    ? "글자가 불분명해요"
                    : "선명하게 읽힘"}
                </small>
              </p>
            ))}
            {observation.observedFeatures.map((f, i) => (
              <p key={`f${i}`}>
                {featureLabels[f.key]} · {f.value}
              </p>
            ))}
            {observation.visualHints &&
              [
                ...observation.visualHints.suspectedBrands,
                ...observation.visualHints.productFamilyHints,
              ].length > 0 && (
                <p>
                  디자인으로 본 추정 ·{" "}
                  {[
                    ...observation.visualHints.suspectedBrands,
                    ...observation.visualHints.productFamilyHints,
                  ].join(", ")}
                </p>
              )}
            {!observation.extractedTexts.length &&
              !observation.observedFeatures.length && (
                <p>읽을 수 있는 글자나 특징이 충분하지 않았어요.</p>
              )}
            <p className="hint">
              사진은 제품을 찾는 데만 쓰고, 부품이 맞는지는 제조사·판매처 자료로
              안내해요.
            </p>
          </div>
        </details>
      )}
    </section>
  );
}
