import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Check,
  CheckCircle2,
  CircleHelp,
  Download,
  Trash2,
  X,
} from "lucide-react";
import { categories, type Category } from "../shared/domain";
import type { CatalogProduct } from "../shared/catalog-search";
import { searchIntent } from "../shared/search-intent";
import { ApiError, fetchJson, pollSerial } from "./network";
import Logo from "./Logo";
import HomePage from "./HomePage";
import PhotoPage from "./PhotoPage";
import ConfirmPage from "./ConfirmPage";
import type { WebLookup } from "./types";
import PartsPage from "./PartsPage";
import PartPage from "./PartPage";
import HelpPage from "./HelpPage";
import ProductCatalog from "./ProductCatalog";
import type { Page, Photo, Recent, RecordResult } from "./types";

const steps: { label: string; pages: Page[] }[] = [
  { label: "제품 찾기", pages: ["home", "photo", "browse"] },
  { label: "제품 확인", pages: ["confirm"] },
  { label: "부품 선택", pages: ["parts", "help"] },
  { label: "구매처 확인", pages: ["part"] },
];

export default function App() {
  const [csrf, setCsrf] = useState(""),
    [available, setAvailable] = useState(false),
    [ready, setReady] = useState(false);
  const [page, setPage] = useState<Page>("home"),
    [activePart, setActivePart] = useState<string | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]),
    [query, setQuery] = useState(""),
    [partQuery, setPartQuery] = useState("");
  const [products, setProducts] = useState<CatalogProduct[]>([]),
    [result, setResult] = useState<RecordResult | null>(null),
    [recent, setRecent] = useState<Recent[]>([]);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [modal, setModal] = useState<"guide" | "privacy" | "history" | null>(null);
  // A shared or reloaded link opens its record, not a flash of the first page.
  const [restoring, setRestoring] = useState(() =>
    Boolean(new URLSearchParams(window.location.search).get("request")),
  );
  const [connectionAttempt, setConnectionAttempt] = useState(0);
  const [pollError, setPollError] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [feedbackPart, setFeedbackPart] = useState(""),
    [feedbackOutcome, setFeedbackOutcome] = useState("not_tested"),
    [feedbackText, setFeedbackText] = useState("");
  const photoRef = useRef<Photo[]>([]);
  const pendingSubmission = useRef<{ fingerprint: string; key: string } | null>(
    null,
  );
  photoRef.current = photos;
  useEffect(
    () => () => photoRef.current.forEach((p) => URL.revokeObjectURL(p.url)),
    [],
  );

  /** Every page is a history entry, so the browser's back button steps back. */
  function go(
    next: Page,
    options: {
      part?: string | null;
      id?: string | null;
      replace?: boolean;
    } = {},
  ) {
    const part = options.part ?? null;
    const id = options.id === undefined ? (result?.id ?? null) : options.id;
    setPage(next);
    setActivePart(part);
    setError("");
    const url =
      id && !["home", "photo", "browse"].includes(next)
        ? `?request=${id}`
        : window.location.pathname;
    window.history[options.replace ? "replaceState" : "pushState"](
      { page: next, part },
      "",
      url,
    );
  }
  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      const state = e.state as { page?: Page; part?: string | null } | null;
      setPage(state?.page ?? "home");
      setActivePart(state?.part ?? null);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  useEffect(() => {
    window.scrollTo({ top: 0 });
    document.getElementById("page-title")?.focus({ preventScroll: true });
  }, [page, activePart, result?.id, result?.state]);

  async function api<T>(
    path: string,
    body?: unknown,
    method = body === undefined ? "GET" : "POST",
    idempotencyKey?: string,
    revision?: number,
  ): Promise<T> {
    const multipart = body instanceof FormData;
    return fetchJson<T>(`/api${path}`, {
      method,
      headers: {
        ...(method !== "GET" ? { "x-csrf-token": csrf } : {}),
        ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
        ...(method === "POST" && revision !== undefined
          ? { "if-match": String(revision) }
          : method === "POST" &&
              result &&
              path.startsWith(`/requests/${result.id}/`)
            ? { "if-match": String(result.revision) }
            : {}),
        ...(body !== undefined && !multipart
          ? { "Content-Type": "application/json" }
          : {}),
      },
      body:
        body === undefined
          ? undefined
          : multipart
            ? body
            : JSON.stringify(body),
    });
  }
  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const session = await fetchJson<{
          csrf: string;
          photoAnalysisAvailable: boolean;
        }>("/api/session");
        if (ignore) return;
        setCsrf(session.csrf);
        setAvailable(session.photoAnalysisAvailable);
        const data = await fetchJson<{ products: CatalogProduct[] }>(
          "/api/catalog",
        );
        if (!ignore) {
          setProducts(data.products);
          setReady(true);
          setError("");
        }
      } catch (e) {
        if (!ignore) setError(message(e));
      }
    })();
    return () => {
      ignore = true;
    };
  }, [connectionAttempt]);
  useEffect(() => {
    if (!ready) return;
    void loadRecent();
    const id = new URLSearchParams(window.location.search).get("request");
    if (id)
      void act(async () =>
        show(
          await api<RecordResult>(`/requests/${encodeURIComponent(id)}`),
          true,
        ),
      ).finally(() => setRestoring(false));
  }, [ready]);
  useEffect(() => {
    setPollError("");
    if (!result || result.state === "ready") return;
    const id = result.id;
    return pollSerial(
      (signal) => fetchJson<RecordResult>(`/api/requests/${id}`, { signal }),
      (next) => {
        setPollError("");
        setResult(next);
        if (next.state === "ready") {
          setAnswers(next.answers);
          void loadRecent();
        }
        return next.state !== "ready";
      },
      (error) => {
        const gone =
          error instanceof ApiError &&
          [401, 403, 404, 410].includes(error.status ?? 0);
        setPollError(
          gone
            ? "이 찾기 기록을 더 이상 열 수 없어요. 처음부터 다시 찾아 주세요."
            : "연결이 잠시 끊겼어요. 사진을 다시 보내지 않고 결과 확인을 재시도하고 있어요.",
        );
        return !gone;
      },
    );
  }, [result?.id, result?.state]);
  async function loadRecent() {
    try {
      setRecent(await api<Recent[]>("/requests"));
    } catch {
      /* Main request surfaces session errors. */
    }
  }
  function message(e: unknown) {
    return e instanceof Error
      ? e.message
      : "문제가 발생했습니다. 다시 시도해 주세요.";
  }
  async function act(task: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await task();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  function show(data: RecordResult, replace = false) {
    setResult(data);
    setAnswers(data.answers);
    go(data.state === "ready" && data.selectedVariantId ? "parts" : "confirm", {
      id: data.id,
      replace,
    });
    void loadRecent();
  }
  function addPhotos(files: FileList | null, role?: Photo["role"]) {
    if (!files) return;
    const incoming = Array.from(files);
    if (incoming.length + photos.length > 4) {
      setError("사진은 최대 4장까지 추가할 수 있어요.");
      return;
    }
    if (
      incoming.some(
        (f) =>
          f.size > 10 * 1024 * 1024 ||
          !["image/jpeg", "image/png", "image/webp"].includes(f.type),
      )
    ) {
      setError("JPG·PNG·WebP 사진을 한 장당 10MB 이하로 추가해 주세요.");
      return;
    }
    setError("");
    setPhotos([
      ...photos,
      ...incoming.map((file, i) => ({
        file,
        url: URL.createObjectURL(file),
        role: (role ??
          (["full", "part", "label", "part"] as const)[photos.length + i] ??
          "part") as Photo["role"],
      })),
    ]);
  }
  function removePhoto(index: number) {
    const p = photos[index];
    if (p) URL.revokeObjectURL(p.url);
    setPhotos(photos.filter((_, i) => i !== index));
  }
  /** `byPhoto` sends the pictures; otherwise the typed words are the search. */
  async function submit(byPhoto: boolean) {
    const inputQuery = byPhoto ? partQuery.trim() : query.trim();
    const category = searchIntent(inputQuery).category;
    await act(async () => {
      let body: unknown = { query: inputQuery, category };
      if (byPhoto) {
        if (!photos.length)
          throw new Error("제품 사진을 한 장 이상 추가해 주세요.");
        const data = new FormData();
        data.set("query", inputQuery);
        data.set("category", category);
        data.set("roles", JSON.stringify(photos.map((p) => p.role)));
        photos.forEach((p) => data.append("images", p.file));
        body = data;
      }
      const fingerprint = JSON.stringify({
        inputQuery,
        byPhoto,
        photos: byPhoto ? photos.map((p) => [p.url, p.role]) : [],
      });
      if (pendingSubmission.current?.fingerprint !== fingerprint)
        pendingSubmission.current = { fingerprint, key: crypto.randomUUID() };
      let next = await api<RecordResult>(
        "/requests",
        body,
        "POST",
        pendingSubmission.current.key,
      );
      pendingSubmission.current = null;
      // A typed model code that names exactly one product needs no second look.
      if (!byPhoto && next.candidates.length === 1)
        next = await api<RecordResult>(
          `/requests/${next.id}/select`,
          {
            variantId: next.candidates[0]!.variantId,
            category: partCategory(next.candidates[0]!.variantId, category),
          },
          "POST",
          undefined,
          next.revision,
        );
      show(next);
    });
  }
  /**
   * The part the user named stays, even when this product has no data for it:
   * an honest empty page beats a silent switch. With no part named, a part seen
   * in the photo comes first, then the product's first part.
   */
  function partCategory(
    variantId: string,
    wanted: Category,
    seen: string[] = [],
  ): Category {
    if (wanted !== "other") return wanted;
    const available =
      products.find((p) => p.variantId === variantId)?.availableCategories ??
      [];
    return (
      available.find((key) => seen.includes(key)) ?? available[0] ?? "other"
    );
  }
  async function select(variantId: string, category?: Category) {
    if (!result) return;
    await act(async () => {
      const next = await api<RecordResult>(`/requests/${result.id}/select`, {
        variantId,
        category:
          category ??
          partCategory(
            variantId,
            result.category,
            result.analysis && "observation" in result.analysis
              ? result.analysis.observation.categoryCandidates.map(
                  (c) => c.categoryKey,
                )
              : [],
          ),
      });
      setResult(next);
      setAnswers(next.answers);
      go("parts", { replace: page === "parts" });
      void loadRecent();
    });
  }
  /** Opens a catalog product directly, skipping the confirmation step. */
  async function openProduct(product: CatalogProduct, wanted: Category) {
    await act(async () => {
      const category =
        wanted !== "other" && product.availableCategories.includes(wanted)
          ? wanted
          : (product.availableCategories[0] ?? "other");
      const created = await api<RecordResult>(
        "/requests",
        { query: product.modelName, category, group: product.group },
        "POST",
        crypto.randomUUID(),
      );
      const selected = await api<RecordResult>(
        `/requests/${created.id}/select`,
        { variantId: product.variantId, category },
        "POST",
        undefined,
        created.revision,
      );
      show(selected);
    });
  }
  async function deleteRecord(id: string) {
    await act(async () => {
      await api(`/requests/${id}`, undefined, "DELETE");
      if (result?.id === id) {
        setResult(null);
        go("home", { id: null, replace: true });
      }
      await loadRecent();
      setNotice("찾기 기록을 삭제했습니다.");
    });
  }
  function download() {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = `parts-${result.id.slice(0, 8)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function startOver() {
    setQuery("");
    setPartQuery("");
    photos.forEach((p) => URL.revokeObjectURL(p.url));
    setPhotos([]);
    go("home", { id: null });
  }

  const selectedProduct = result?.selectedVariantId
    ? (result.paths.product ?? null)
    : null;
  const activeCard =
    result?.paths.cards.find((c) => c.part.partId === activePart) ?? null;
  // A page that needs data the session no longer has falls back one step.
  const view: Page =
    ["confirm", "parts", "part", "help"].includes(page) && !result
      ? "home"
      : ["parts", "part"].includes(page) && !selectedProduct
        ? "confirm"
        : page === "part" && !activeCard
          ? "parts"
          : page;
  const stepIndex = steps.findIndex((s) => s.pages.includes(view));
  const stepTarget: (Page | null)[] = [
    "home",
    result ? "confirm" : null,
    selectedProduct ? "parts" : null,
    null,
  ];
  return (
    <>
      <a className="skip-link" href="#main-content">
        본문으로 건너뛰기
      </a>
      <header className="header">
        <a
          href="/"
          className="brand"
          aria-label="딱품 처음으로"
          onClick={(e) => {
            e.preventDefault();
            startOver();
          }}
        >
          <Logo />
        </a>
        <nav aria-label="주 메뉴">
          <button onClick={() => setModal("guide")}>이용 방법</button>
          <button
            className="history-button"
            onClick={() => {
              void loadRecent();
              setModal("history");
            }}
          >
            최근 찾기{recent.length > 0 && <span>{recent.length}</span>}
          </button>
        </nav>
      </header>
      <main id="main-content">
        {view !== "home" && (
          <ol className="steps" aria-label="찾기 단계">
            {steps.map((step, i) => {
              const target = i < stepIndex ? stepTarget[i] : null;
              return (
                <li
                  key={step.label}
                  aria-current={i === stepIndex ? "step" : undefined}
                  className={i < stepIndex ? "done" : undefined}
                >
                  {target ? (
                    <button
                      onClick={() =>
                        target === "home" ? startOver() : go(target)
                      }
                    >
                      <span>{i + 1}</span>
                      {step.label}
                    </button>
                  ) : (
                    <>
                      <span>{i + 1}</span>
                      {step.label}
                    </>
                  )}
                </li>
              );
            })}
          </ol>
        )}
        {error && !modal && !feedbackPart && (
          <div className="alert error" role="alert">
            <CircleHelp size={19} />
            <span>{error}</span>
            {!ready && (
              <button
                className="text-button"
                onClick={() => {
                  setError("");
                  setConnectionAttempt((n) => n + 1);
                }}
              >
                연결 다시 확인
              </button>
            )}
            <button aria-label="알림 닫기" onClick={() => setError("")}>
              <X size={16} />
            </button>
          </div>
        )}
        {notice && (
          <div className="alert success" role="status">
            <CheckCircle2 size={18} />
            <span>{notice}</span>
            <button aria-label="완료 알림 닫기" onClick={() => setNotice("")}>
              <X size={16} />
            </button>
          </div>
        )}
        {view === "home" && restoring && !error && (
          <p className="restoring" role="status">
            찾기 기록을 불러오는 중이에요.
          </p>
        )}
        {view === "home" && !(restoring && !error) && (
          <HomePage
            products={products}
            ready={ready}
            busy={busy}
            query={query}
            onQuery={setQuery}
            onSubmit={() => void submit(false)}
            onPick={(p) => void openProduct(p, searchIntent(query).category)}
            onPhoto={() => go("photo", { id: null })}
            onBrowse={() => go("browse", { id: null })}
          />
        )}
        {view === "photo" && (
          <PhotoPage
            photos={photos}
            partQuery={partQuery}
            busy={busy}
            ready={ready}
            available={available}
            onAdd={addPhotos}
            onRemove={removePhoto}
            onRole={(index, role) =>
              setPhotos(
                photos.map((p, i) => (i === index ? { ...p, role } : p)),
              )
            }
            onPartQuery={setPartQuery}
            onSubmit={() => void submit(true)}
            onBack={() => go("home", { id: null })}
          />
        )}
        {view === "browse" && (
          <section className="page" aria-labelledby="page-title">
            <button
              className="back-link"
              onClick={() => go("home", { id: null })}
            >
              ← 처음으로
            </button>
            <h1 id="page-title" tabIndex={-1}>
              등록된 제품
            </h1>
            <p className="page-lead">
              제품을 고르면 맞는 부품과 구매처를 바로 보여 드려요.
            </p>
            <ProductCatalog
              products={products}
              category="other"
              busy={busy}
              onSelect={(id) => {
                const product = products.find((p) => p.variantId === id);
                if (product) void openProduct(product, "other");
              }}
            />
          </section>
        )}
        {view === "confirm" && result && (
          <ConfirmPage
            result={result}
            products={products}
            busy={busy}
            pollError={pollError}
            onSelect={(id) => void select(id)}
            onHelp={() => go("help")}
            onRetake={() => go("photo", { id: null })}
            onWebLookup={() =>
              api<WebLookup>(`/requests/${result.id}/web`, {})
            }
          />
        )}
        {view === "parts" && result && selectedProduct && (
          <PartsPage
            result={result}
            product={products.find(
              (p) => p.variantId === selectedProduct.variantId,
            )}
            busy={busy}
            onCategory={(key) => void select(selectedProduct.variantId, key)}
            onOpen={(card) => go("part", { part: card.part.partId })}
            onOtherProduct={() => go("confirm")}
            onHelp={() => go("help")}
          />
        )}
        {view === "part" && result && selectedProduct && activeCard && (
          <PartPage
            card={activeCard}
            product={selectedProduct}
            onBack={() => go("parts")}
            onFeedback={() => {
              setFeedbackPart(activeCard.part.partId);
              setFeedbackText("");
              setFeedbackOutcome("not_tested");
            }}
          />
        )}
        {view === "help" && result && (
          <HelpPage
            result={result}
            answers={answers}
            busy={busy}
            onAnswers={setAnswers}
            onSave={() =>
              void act(async () => {
                setResult(
                  await api<RecordResult>(
                    `/requests/${result.id}/answers`,
                    answers,
                  ),
                );
                setNotice(
                  "적어 둔 규격을 저장했어요. 검색어와 문의 내용에 반영됩니다.",
                );
              })
            }
            onCopy={() =>
              void act(async () => {
                await navigator.clipboard.writeText(result.paths.contactDraft);
                setNotice(
                  "문의 내용을 복사했어요. 제조사 문의 창에 붙여 넣어 주세요.",
                );
              })
            }
            onBack={() => go(selectedProduct ? "parts" : "confirm")}
          />
        )}
        {result && ["parts", "part", "help"].includes(view) && (
          <div className="record-tools">
            {selectedProduct && (
              <button className="text-button" onClick={download}>
                <Download size={15} />
                결과 저장 (JSON)
              </button>
            )}
            <button
              className="text-button danger"
              disabled={busy}
              onClick={() => void deleteRecord(result.id)}
            >
              <Trash2 size={15} />이 찾기 기록 삭제
            </button>
          </div>
        )}
      </main>
      <footer>
        <p>
          <strong>딱 맞는 부품, 더 오래 쓰는 일상</strong>
          사진은 제품을 찾는 데만 쓰고, 부품이 맞는지는 출처가 있는 자료로
          안내해요.
        </p>
        <div className="footer-links">
          <button onClick={() => setModal("guide")}>이용 방법</button>
          <button onClick={() => setModal("privacy")}>
            사진·정보 보관 안내
          </button>
        </div>
      </footer>
      {modal && (
        <Modal
          title={
            modal === "guide"
              ? "이용 방법"
              : modal === "privacy"
                ? "사진·정보 보관 안내"
                : "최근 찾기"
          }
          onClose={() => setModal(null)}
          error={error}
        >
          {modal === "history" ? (
            <>
              {recent.length ? (
                recent.map((r) => (
                  <div className="recent-row" key={r.id}>
                    <button
                      onClick={() =>
                        void act(async () => {
                          show(await api<RecordResult>(`/requests/${r.id}`));
                          setModal(null);
                        })
                      }
                    >
                      <span>
                        <strong>{r.label}</strong>
                        <small>
                          {categories[r.category]} ·{" "}
                          {new Date(r.createdAt).toLocaleString("ko-KR")}
                          {r.state !== "ready" ? " · 분석 중" : ""}
                        </small>
                      </span>
                    </button>
                    <button
                      aria-label={`${r.label} 기록 삭제`}
                      disabled={busy}
                      onClick={() => void deleteRecord(r.id)}
                    >
                      <Trash2 size={17} />
                    </button>
                  </div>
                ))
              ) : (
                <div className="empty">
                  <p>아직 찾은 부품이 없어요.</p>
                </div>
              )}
              <p className="hint">
                이 브라우저의 기록만 보여 주며 최대 24시간 보관해요.
              </p>
            </>
          ) : modal === "privacy" ? (
            <div className="prose">
              <p>
                사진은 서버에서 크기를 줄이고 위치 정보 등 EXIF를 제거한 뒤,
                연결된 AI API에 분석 목적으로 전송합니다.
              </p>
              <p>
                얼굴·주소·전화번호가 포함되지 않은 제품 사진을 사용해 주세요.
                관찰 모델은 보이는 개인정보를 옮기지 않도록 지시받습니다.
              </p>
              <p>
                분석 대기 중에는 사진을 임시 보관하고, 분석 완료 후 서버의 사진
                데이터를 제거합니다. 찾기 기록과 입력한 확인 내용은 이 브라우저
                세션에 연결되며 최대 24시간 보관합니다. 최근 찾기에서 바로
                삭제할 수 있습니다.
              </p>
              <p>
                API 제공자의 보관 정책은 서비스 제공자 정책에 따릅니다. 이
                앱에서 API 제공자의 저장 데이터를 직접 삭제할 수는 없습니다.
              </p>
              <p>
                장착 결과는 미검증 사용자 기록으로만 저장하며, 다른 사용자에게
                공개하거나 호환 근거로 자동 반영하지 않습니다.
              </p>
            </div>
          ) : (
            <div className="prose">
              <p>
                <strong>1. 제품 찾기</strong>
                <br />
                제품 이름이나 모델명을 검색하거나, 제품 사진을 올려 주세요.
              </p>
              <p>
                <strong>2. 제품 확인</strong>
                <br />
                후보 중에서 내 제품을 골라 주세요. 모델명을 읽지 못한 사진은
                비슷한 제품을 추정해 위에 보여 드려요.
              </p>
              <p>
                <strong>3. 부품 선택</strong>
                <br />
                제품에 맞는 부품과 사면 안 되는 부품을 구분해 보여 드려요.
              </p>
              <p>
                <strong>4. 구매처 확인</strong>
                <br />살 수 있는 곳과, 그 부품이 맞는다고 한 제조사·판매처
                자료를 함께 확인하세요. ‘적용 대상에 명시됨’은 출처의 설명이며
                실제 장착 검증을 뜻하지 않아요.
              </p>
              <p>
                상품 정보는 직접 검수한 목록이며 실시간 웹 검색 결과가 아니에요.
                재고·배송·가격은 판매 페이지에서 확인해 주세요.
              </p>
            </div>
          )}
        </Modal>
      )}
      {feedbackPart && result && (
        <Modal
          title="장착 결과 기록"
          onClose={() => setFeedbackPart("")}
          error={error}
        >
          <form
            className="feedback-form"
            onSubmit={(e) => {
              e.preventDefault();
              void act(async () => {
                await api(`/requests/${result.id}/feedback`, {
                  partId: feedbackPart,
                  outcome: feedbackOutcome,
                  conditions: feedbackText,
                  testedAt: new Date().toISOString().slice(0, 10),
                });
                setResult(await api<RecordResult>(`/requests/${result.id}`));
                setFeedbackPart("");
                setNotice("장착 결과를 미검증 개인 기록으로 저장했습니다.");
              });
            }}
          >
            <p>
              직접 확인한 내용만 기록해 주세요. 이 기록은 호환 근거로 자동
              공개되지 않습니다.
            </p>
            <label>
              확인 결과
              <select
                value={feedbackOutcome}
                onChange={(e) => setFeedbackOutcome(e.target.value)}
              >
                <option value="not_tested">아직 장착해 보지 않았어요</option>
                <option value="fits">장착됐어요</option>
                <option value="does_not_fit">맞지 않았어요</option>
              </select>
            </label>
            <label>
              부품 버전·사용 조건·확인한 내용
              <textarea
                required
                maxLength={500}
                value={feedbackText}
                onChange={(e) => setFeedbackText(e.target.value)}
                placeholder="확인한 내용을 입력해주세요"
              />
            </label>
            <button className="primary" disabled={busy}>
              개인 기록 저장
              <Check size={16} />
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}

function Modal({
  title,
  onClose,
  children,
  error,
}: {
  title: string;
  error?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = dialog.current;
    d?.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      aria-labelledby="modal-title"
    >
      <div className="modal-header">
        <h2 id="modal-title">{title}</h2>
        <button aria-label="닫기" onClick={onClose}>
          <X size={21} />
        </button>
      </div>
      {error && (
        <div className="alert warning" role="alert">
          <CircleHelp size={18} />
          <span>{error}</span>
        </div>
      )}
      {children}
    </dialog>
  );
}
