import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Camera,
  Check,
  CheckCircle2,
  CircleHelp,
  Clock3,
  Download,
  ExternalLink,
  FileText,
  History,
  ImagePlus,
  Leaf,
  LoaderCircle,
  Package,
  Puzzle,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import {
  categories,
  providerLabels,
  stockLabels,
  type Category,
  type Product,
} from "../shared/domain";
import type { AnalysisResult } from "../src/analysis";
import type { PathsResult } from "../server/resolver";
import MeasurementGuide from "./MeasurementGuide";
import ProductCatalog from "./ProductCatalog";
import type { CatalogProduct } from "../shared/catalog-search";

type RecordResult = {
  revision: number;
  id: string;
  createdAt: number;
  state: "queued" | "processing" | "ready";
  query: string;
  category: Category;
  selectedVariantId: string | null;
  analysis: AnalysisResult | null;
  answers: Record<string, string>;
  feedback: unknown[];
  candidates: Product[];
  photoHints?: { products: Product[]; description: string };
  paths: PathsResult;
};
type Photo = { file: File; url: string; role: "full" | "part" | "label" };
type Recent = {
  id: string;
  createdAt: number;
  state: string;
  category: Category;
  label: string;
};
const roleLabels = {
  full: "제품 전체",
  part: "부품·장착부",
  label: "모델명 라벨",
};
const qualityLabels: Record<string, string> = {
  blurry: "사진이 흐려요",
  glare: "빛 반사가 있어요",
  subject_too_small: "대상이 작게 보여요",
  label_cropped: "라벨 일부가 잘렸어요",
  label_missing: "모델명 라벨이 없어요",
  personal_info_visible: "개인정보가 보여요",
  other: "추가 확인이 필요해요",
};
const featureLabels: Record<string, string> = {
  lid_connection: "결합 방식",
  lid_type: "뚜껑 형태",
  gasket_cross_section: "패킹 단면",
  has_straw: "빨대",
  has_handle: "손잡이",
  ruler_visible: "자",
  other: "특징",
};
const reviewLabels: Record<string, string> = {
  source_supported: "적용 대상에 명시됨",
  check_required: "세부 조건 확인 필요",
  unverified: "적용 근거 미확인",
  conflict: "근거가 서로 달라요",
  excluded: "적용 제외",
};
const external = (url: string) => ({
  href: url,
  target: "_blank",
  rel: "noopener noreferrer",
});

export default function App() {
  const [csrf, setCsrf] = useState(""),
    [available, setAvailable] = useState(false),
    [ready, setReady] = useState(false);
  const [tab, setTab] = useState<"photo" | "model">("photo"),
    [photos, setPhotos] = useState<Photo[]>([]),
    [query, setQuery] = useState(""),
    [category, setCategory] = useState<Category>("lid");
  const [catalogCounts, setCatalogCounts] = useState({
    products: 0,
    parts: 0,
    brands: 0,
  });
  const [products, setProducts] = useState<CatalogProduct[]>([]),
    [result, setResult] = useState<RecordResult | null>(null),
    [recent, setRecent] = useState<Recent[]>([]);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [modal, setModal] = useState<
      "guide" | "privacy" | "history" | "catalog" | null
    >(null);
  const [route, setRoute] = useState("all"),
    [answers, setAnswers] = useState<Record<string, string>>({});
  const [feedbackPart, setFeedbackPart] = useState(""),
    [feedbackOutcome, setFeedbackOutcome] = useState("not_tested"),
    [feedbackText, setFeedbackText] = useState("");
  const input = useRef<HTMLInputElement>(null),
    labelInput = useRef<HTMLInputElement>(null),
    cameraInput = useRef<HTMLInputElement>(null),
    resultsRef = useRef<HTMLElement>(null),
    photoRef = useRef<Photo[]>([]);
  const pendingSubmission = useRef<{ fingerprint: string; key: string } | null>(
    null,
  );
  photoRef.current = photos;
  useEffect(
    () => () => photoRef.current.forEach((p) => URL.revokeObjectURL(p.url)),
    [],
  );
  async function api<T>(
    path: string,
    body?: unknown,
    method = body === undefined ? "GET" : "POST",
    idempotencyKey?: string,
  ): Promise<T> {
    const multipart = body instanceof FormData;
    const response = await fetch(`/api${path}`, {
      method,
      headers: {
        ...(method !== "GET" ? { "x-csrf-token": csrf } : {}),
        ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
        ...(method === "POST" &&
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
    if (response.status === 204) return undefined as T;
    const data = await response.json();
    if (!response.ok)
      throw new Error(
        data.error ?? "요청을 처리하지 못했습니다. 다시 시도해 주세요.",
      );
    return data;
  }
  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const response = await fetch("/api/session");
        if (!response.ok) throw new Error("서버 연결을 확인해 주세요.");
        const session = await response.json();
        if (ignore) return;
        setCsrf(session.csrf);
        setAvailable(session.photoAnalysisAvailable);
        setReady(true);
        const data = await fetch("/api/catalog").then((r) => r.json());
        if (!ignore) {
          setProducts(data.products);
          setCatalogCounts(data.counts);
        }
      } catch (e) {
        if (!ignore) setError(message(e));
      }
    })();
    return () => {
      ignore = true;
    };
  }, []);
  useEffect(() => {
    if (!ready) return;
    void loadRecent();
    const id = new URLSearchParams(window.location.search).get("request");
    if (id)
      void act(async () =>
        show(await api<RecordResult>(`/requests/${encodeURIComponent(id)}`)),
      );
  }, [ready]);
  useEffect(() => {
    if (!result || result.state === "ready") return;
    let cancelled = false;
    const id = result.id;
    const timer = setInterval(async () => {
      try {
        const next = await api<RecordResult>(`/requests/${id}`);
        if (!cancelled) {
          setResult(next);
          if (next.state === "ready") {
            setAnswers(next.answers);
            void loadRecent();
          }
        }
      } catch (e) {
        if (!cancelled) setError(message(e));
      }
    }, 1500);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
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
  function show(data: RecordResult) {
    setResult(data);
    setAnswers(data.answers);
    setCategory(data.category);
    setRoute("all");
    window.history.replaceState({}, "", `?request=${data.id}`);
    setTimeout(
      () =>
        resultsRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        }),
      80,
    );
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
    setTab("photo");
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
  async function submit(demo = false) {
    await act(async () => {
      let body: unknown = { query, category, ...(demo ? { demo: true } : {}) };
      if (tab === "photo" && !demo) {
        if (!photos.length)
          throw new Error("제품 사진을 한 장 이상 추가해 주세요.");
        const data = new FormData();
        data.set("query", query);
        data.set("category", category);
        data.set("roles", JSON.stringify(photos.map((p) => p.role)));
        photos.forEach((p) => data.append("images", p.file));
        body = data;
      }
      const fingerprint = JSON.stringify({
        query,
        category,
        tab,
        demo,
        photos: photos.map((p) => [p.url, p.role]),
      });
      if (pendingSubmission.current?.fingerprint !== fingerprint)
        pendingSubmission.current = { fingerprint, key: crypto.randomUUID() };
      const next = await api<RecordResult>(
        "/requests",
        body,
        "POST",
        pendingSubmission.current.key,
      );
      pendingSubmission.current = null;
      show(next);
    });
  }
  async function select(
    variantId: string | null,
    newCategory = result?.category ?? category,
  ) {
    if (!result) return;
    await act(async () => {
      const next = await api<RecordResult>(`/requests/${result.id}/select`, {
        variantId,
        category: newCategory,
      });
      setResult(next);
      setAnswers(next.answers);
      setRoute("all");
      void loadRecent();
    });
  }
  async function deleteRecord(id: string) {
    await act(async () => {
      await api(`/requests/${id}`, undefined, "DELETE");
      if (result?.id === id) {
        setResult(null);
        window.history.replaceState({}, "", "/");
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
  const observation =
    result?.analysis && "observation" in result.analysis
      ? result.analysis.observation
      : null;
  const shownCards =
    result?.paths.cards.filter(
      (c) => route === "all" || c.part.origin === route,
    ) ?? [];
  const actionable = shownCards.filter(
    (c) => !["excluded", "conflict"].includes(c.status),
  );
  const excluded = shownCards.filter((c) =>
    ["excluded", "conflict"].includes(c.status),
  );
  return (
    <>
      <input
        ref={labelInput}
        className="hidden-input"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        aria-label="라벨 사진 선택"
        onChange={(e) => {
          addPhotos(e.target.files, "label");
          e.target.value = "";
        }}
      />
      <input
        ref={cameraInput}
        className="hidden-input"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        aria-label="카메라로 제품 촬영"
        onChange={(e) => {
          addPhotos(e.target.files);
          e.target.value = "";
        }}
      />
      <header className="header">
        <a href="/" className="brand" aria-label="딱맞는부품 처음으로">
          <span className="brand-icon">
            <Puzzle size={23} />
          </span>
          딱맞는부품<span className="beta">BETA</span>
        </a>
        <nav>
          <button onClick={() => setModal("guide")}>이용 방법</button>
          <button
            className="history-button"
            onClick={() => {
              void loadRecent();
              setModal("history");
            }}
          >
            <History size={16} />
            최근 찾기<span>{recent.length}</span>
          </button>
        </nav>
      </header>
      <main>
        <section className="hero">
          <div className="hero-copy">
            <span className="eyebrow">
              <span />
              물건의 다음 이야기를 찾아요
            </span>
            <h1>
              작은 부품 하나로,
              <br />
              <em>다시 쓰는 일상.</em>
            </h1>
            <p>
              뚜껑이 없어도, 패킹이 닳아도.
              <br />내 물건에 필요한 부품과 구할 수 있는 길을 찾아보세요.
            </p>
            <div className="hero-tags">
              <span>
                <ShieldCheck size={16} />
                출처와 근거를 함께
              </span>
              <span>
                <Leaf size={16} />
                새로 사기 전에 한 번 더
              </span>
            </div>
          </div>
          <div className="hero-art" aria-hidden="true">
            <span className="art-orbit orbit-one" />
            <span className="art-orbit orbit-two" />
            <div className="art-label label-one">
              <CheckCircle2 size={17} />
              맞는 부품, 확인하고
            </div>
            <svg className="bottle-art" viewBox="0 0 420 350">
              <defs>
                <linearGradient id="bottle" x1="0" x2="1">
                  <stop stopColor="#afc2b0" />
                  <stop offset=".5" stopColor="#dce6d5" />
                  <stop offset="1" stopColor="#9eafa0" />
                </linearGradient>
                <linearGradient id="cap" x1="0" x2="1">
                  <stop stopColor="#233e35" />
                  <stop offset="1" stopColor="#466055" />
                </linearGradient>
              </defs>
              <ellipse cx="213" cy="312" rx="113" ry="17" fill="#203d3412" />
              <g transform="rotate(-12 205 210)">
                <rect
                  x="143"
                  y="137"
                  width="124"
                  height="167"
                  rx="30"
                  fill="url(#bottle)"
                />
                <path
                  d="M145 166q-5-21 17-35v-22h86v22q22 14 18 35"
                  fill="url(#bottle)"
                />
                <ellipse cx="205" cy="109" rx="43" ry="11" fill="#526d59" />
                <ellipse cx="205" cy="109" rx="32" ry="7" fill="#233f36" />
                <path
                  d="M163 116q40 14 85 0m-85 7q40 14 85 0"
                  fill="none"
                  stroke="#789281"
                  strokeWidth="3"
                />
                <path
                  d="M165 178v86q0 15 12 18"
                  stroke="#f0f3e8"
                  strokeOpacity=".65"
                  strokeWidth="8"
                  strokeLinecap="round"
                  fill="none"
                />
                <circle
                  cx="207"
                  cy="224"
                  r="23"
                  stroke="#78947e"
                  strokeWidth="1.5"
                  fill="none"
                />
                <path
                  d="M198 232q-4-20 18-21-1 19-18 21m0 0 11-12"
                  stroke="#547962"
                  strokeWidth="2"
                  fill="none"
                />
              </g>
              <g transform="rotate(10 230 67)">
                <path d="M184 56v29q46 20 91 0V56" fill="url(#cap)" />
                <ellipse cx="230" cy="56" rx="46" ry="12" fill="#546c5d" />
                <path
                  d="M259 46q39-50 58-9t-32 48"
                  fill="none"
                  stroke="#365247"
                  strokeWidth="11"
                  strokeLinecap="round"
                />
                <path
                  d="M260 46q33-40 49-10"
                  fill="none"
                  stroke="#5e7769"
                  strokeWidth="3"
                />
                <ellipse cx="230" cy="86" rx="44" ry="10" fill="#213e36" />
              </g>
              <ellipse
                cx="309"
                cy="231"
                rx="35"
                ry="17"
                fill="none"
                stroke="#d48a58"
                strokeWidth="9"
                transform="rotate(-25 309 231)"
              />
              <path
                d="M103 88v18m-9-9h18M320 153v12m-6-6h12"
                stroke="#bf8257"
                strokeWidth="2"
              />
              <path
                d="M114 220l-23 8m207-83 20-5"
                stroke="#7f9686"
                strokeWidth="2"
                strokeDasharray="3 5"
              />
            </svg>
            <div className="art-label label-two">
              <Leaf size={16} />
              오래오래 함께
            </div>
            <span className="illustration-note">
              제품 형태를 표현한 일러스트입니다
            </span>
          </div>
        </section>
        <section className="finder" aria-labelledby="finder-title">
          <div className="finder-title">
            <div>
              <span className="section-kicker">FIND YOUR PART</span>
              <h2 id="finder-title">어떤 부품을 찾고 있나요?</h2>
            </div>
            <span className="scope-note">지금은 물병·텀블러부터</span>
          </div>
          <div className="finder-grid">
            <div className="finder-main">
              <div className="tabs" role="tablist" aria-label="찾는 방법">
                <button
                  role="tab"
                  aria-selected={tab === "photo"}
                  className={tab === "photo" ? "active" : ""}
                  onClick={() => setTab("photo")}
                >
                  <Camera size={18} />
                  사진으로 찾기
                </button>
                <button
                  role="tab"
                  aria-selected={tab === "model"}
                  className={tab === "model" ? "active" : ""}
                  onClick={() => setTab("model")}
                >
                  <Search size={18} />
                  모델명으로 찾기
                </button>
              </div>
              <div className="category-field">
                <span className="field-label">필요한 부품</span>
                <div className="chips">
                  {Object.entries(categories).map(([key, label]) => (
                    <button
                      key={key}
                      aria-pressed={category === key}
                      onClick={() => setCategory(key as Category)}
                      className={category === key ? "selected" : ""}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              {tab === "photo" ? (
                <>
                  <input
                    ref={input}
                    className="hidden-input"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    onChange={(e) => {
                      addPhotos(e.target.files);
                      e.target.value = "";
                    }}
                    aria-label="제품 사진 선택"
                  />
                  {photos.length === 0 ? (
                    <button
                      className="drop-zone"
                      onClick={() => input.current?.click()}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        addPhotos(e.dataTransfer.files);
                      }}
                    >
                      <span className="upload-icon">
                        <ImagePlus size={27} />
                      </span>
                      <strong>사진을 올려주세요</strong>
                      <span>클릭하거나 이곳에 사진을 끌어 놓으세요</span>
                      <small>JPG, PNG, WebP · 최대 4장 · 한 장당 10MB</small>
                    </button>
                  ) : (
                    <div className="photo-grid">
                      {photos.map((photo, i) => (
                        <div className="photo" key={photo.url}>
                          <img src={photo.url} alt={`추가한 사진 ${i + 1}`} />
                          <button
                            className="remove-photo"
                            aria-label={`사진 ${i + 1} 삭제`}
                            onClick={() => removePhoto(i)}
                          >
                            <X size={16} />
                          </button>
                          <select
                            aria-label={`사진 ${i + 1} 역할`}
                            value={photo.role}
                            onChange={(e) =>
                              setPhotos(
                                photos.map((p, j) =>
                                  j === i
                                    ? {
                                        ...p,
                                        role: e.target.value as Photo["role"],
                                      }
                                    : p,
                                ),
                              )
                            }
                          >
                            {Object.entries(roleLabels).map(([key, label]) => (
                              <option key={key} value={key}>
                                {label}
                              </option>
                            ))}
                          </select>
                        </div>
                      ))}
                      {photos.length < 4 && (
                        <button
                          className="add-photo"
                          onClick={() => input.current?.click()}
                        >
                          <ImagePlus size={24} />
                          사진 추가
                        </button>
                      )}
                    </div>
                  )}
                  <div className="photo-actions">
                    <button
                      className="outline-button"
                      disabled={photos.length >= 4 || busy}
                      onClick={() => cameraInput.current?.click()}
                    >
                      <Camera size={18} />
                      직접 촬영
                    </button>
                    <button
                      className="outline-button"
                      disabled={photos.length >= 4 || busy}
                      onClick={() => labelInput.current?.click()}
                    >
                      <FileText size={18} />
                      라벨 사진 추가
                    </button>
                  </div>
                  <div className="photo-checklist" aria-label="사진 준비 상태">
                    {Object.entries(roleLabels).map(([role, label]) => (
                      <span
                        key={role}
                        className={
                          photos.some((p) => p.role === role) ? "complete" : ""
                        }
                      >
                        {photos.some((p) => p.role === role) ? "✓" : "○"}{" "}
                        {label}
                      </span>
                    ))}
                  </div>
                  <p className="photo-tip">
                    바닥의 모델 코드와 용량이 화면에 크게 보이도록 찍어 주세요.
                    작은 글자는 라벨 사진으로 따로 올리면 좋아요.
                  </p>
                  <label className="model-input-label">
                    모델명을 알고 있나요? <span>선택</span>
                    <input
                      value={query}
                      maxLength={120}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="예: 날진 와이드마우스 32oz"
                    />
                  </label>
                </>
              ) : (
                <label className="model-input-label main-search">
                  브랜드 또는 모델명
                  <input
                    autoFocus
                    value={query}
                    maxLength={120}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !busy && ready && query.trim())
                        void submit();
                    }}
                    placeholder="예: 써모스 JNL-505K"
                  />
                  <span>라벨이나 구매 내역에 적힌 이름을 입력해 주세요.</span>
                  <div className="quick-queries">
                    {["써모스 JNL", "킨토 워터보틀", "조지루시 SM-VB"].map(
                      (q) => (
                        <button key={q} onClick={() => setQuery(q)}>
                          {q}
                          <ArrowUpRight size={13} />
                        </button>
                      ),
                    )}
                  </div>
                </label>
              )}
              <button
                className="primary find-button"
                disabled={
                  busy ||
                  !ready ||
                  (tab === "photo"
                    ? !available || photos.length === 0
                    : !query.trim())
                }
                onClick={() => void submit()}
              >
                {busy ? (
                  <LoaderCircle className="spin" size={18} />
                ) : (
                  <Search size={18} />
                )}
                부품 찾기
                <ArrowRight size={18} />
              </button>
              <button
                className="text-button catalog-entry"
                disabled={!ready || busy}
                onClick={() => setModal("catalog")}
              >
                <Package size={16} /> 등록 제품 {catalogCounts.products}개
                둘러보기 <ArrowRight size={16} />
              </button>
              {ready && !available && tab === "photo" && (
                <p className="hint">
                  사진 분석 연결을 준비 중이에요. 모델명으로 먼저 찾아보세요.
                </p>
              )}
              <p className="data-note">
                <ShieldCheck size={13} />
                사진은 분석 후 제거하며, 찾기 기록은 최대 24시간 보관합니다.
              </p>
            </div>
            <aside className="photo-guide">
              <span className="mini-label">이렇게 준비하면 좋아요</span>
              <h3>
                사진 세 장이면
                <br /> 더 잘 알 수 있어요.
              </h3>
              <div className="guide-row">
                <span>01</span>
                <div>
                  <strong>제품 전체</strong>
                  <p>전체 모양과 브랜드가 보이게</p>
                </div>
                <Package size={22} />
              </div>
              <div className="guide-row">
                <span>02</span>
                <div>
                  <strong>부품 또는 장착부</strong>
                  <p>나사산과 연결 부분을 가까이</p>
                </div>
                <Puzzle size={22} />
              </div>
              <div className="guide-row">
                <span>03</span>
                <div>
                  <strong>모델명 라벨</strong>
                  <p>바닥·옆면의 글자가 선명하게</p>
                </div>
                <FileText size={22} />
              </div>
              <div className="guide-bottom">
                <CircleHelp size={17} />
                <p>
                  사진에서 안 보이는 정보는
                  <br /> 추측하지 않고 다시 물어볼게요.
                </p>
              </div>
              <button
                className="text-button"
                disabled={busy || !ready || !available}
                onClick={() => void submit(true)}
              >
                공개 예제 사진으로 분석 체험
                <ArrowRight size={15} />
              </button>
              <small className="attribution">
                예제: Corn cheese ·{" "}
                <a
                  {...external(
                    "https://commons.wikimedia.org/wiki/File:Stainless_steel_water_bottle.jpg",
                  )}
                >
                  Wikimedia Commons
                </a>{" "}
                ·{" "}
                <a
                  {...external(
                    "https://creativecommons.org/licenses/by-sa/4.0/",
                  )}
                >
                  CC BY-SA 4.0
                </a>
                <br />
                축소·재인코딩·EXIF 제거. 모델 식별용 사진은 아닙니다.
              </small>
            </aside>
          </div>
        </section>
        {error && (
          <div className="alert error" role="alert">
            <CircleHelp size={19} />
            <span>{error}</span>
            <button aria-label="알림 닫기" onClick={() => setError("")}>
              <X size={16} />
            </button>
          </div>
        )}
        {notice && (
          <div className="alert success" role="status">
            <CheckCircle2 size={18} />
            {notice}
          </div>
        )}
        {result && (
          <section
            className="results"
            ref={resultsRef}
            aria-labelledby="results-title"
          >
            <div className="result-header">
              <div>
                <span className="section-kicker">YOUR NEXT STEP</span>
                <h2 id="results-title">다시 쓸 수 있는 방법</h2>
              </div>
              <button
                className="icon-button"
                title="이 기록 삭제"
                aria-label="현재 찾기 기록 삭제"
                disabled={busy}
                onClick={() => void deleteRecord(result.id)}
              >
                <Trash2 size={18} />
              </button>
            </div>
            {result.state !== "ready" ? (
              <div className="loading-card" role="status">
                <LoaderCircle className="spin" size={34} />
                <h3>
                  {result.state === "queued"
                    ? "사진 분석을 기다리고 있어요"
                    : "사진에서 보이는 정보를 살펴보고 있어요"}
                </h3>
                <p>
                  제품 모양, 라벨의 글자, 부품의 결합 방식을 확인합니다.
                  <br />
                  분석에는 보통 수십 초가 걸립니다. 이 창을 닫아도 최근 찾기에서
                  이어갈 수 있어요.
                </p>
              </div>
            ) : (
              <>
                {observation && !result.selectedVariantId && (
                  <div className="photo-advice">
                    <strong>
                      {result.candidates.length
                        ? "사진 속 글자를 한 번 더 확인해 주세요"
                        : "제품을 좁히려면 라벨을 확인해 주세요"}
                    </strong>
                    <p>
                      {observation.qualityIssues.includes("glare")
                        ? "빛이 비치는 방향을 바꾸고 플래시 없이 라벨을 찍어 주세요."
                        : observation.qualityIssues.includes("blurry")
                          ? "렌즈를 닦고 글자에 초점을 맞춰 다시 찍어 주세요."
                          : observation.qualityIssues.includes("label_cropped")
                            ? "모델 코드가 잘리지 않도록 라벨 전체를 담아 주세요."
                            : "제품 바닥·옆면의 모델명과 용량을 확인해 주세요. 브랜드나 모양만으로 같은 제품이라고 확정하지 않습니다."}
                    </p>
                    {observation.extractedTexts.some(
                      (t) => t.legibility === "uncertain",
                    ) && (
                      <p>
                        불분명한 글자는 추측하지 않았습니다. O/0, I/1, S/5를
                        라벨과 비교해 주세요.
                      </p>
                    )}
                    <button
                      className="text-button"
                      disabled={photos.length >= 4 || busy}
                      onClick={() => {
                        labelInput.current?.click();
                        document
                          .getElementById("finder-title")
                          ?.scrollIntoView({ behavior: "smooth" });
                      }}
                    >
                      라벨 사진 추가해서 다시 찾기 <ArrowRight size={15} />
                    </button>
                    {photos.length >= 4 && (
                      <small>
                        사진이 4장입니다. 위에서 한 장을 삭제한 뒤 라벨 사진을
                        추가해 주세요.
                      </small>
                    )}
                  </div>
                )}
                {observation && (
                  <details className="observation">
                    <summary>
                      <Sparkles size={16} />
                      사진에서 확인한 내용 <span>관찰 결과 보기</span>
                    </summary>
                    <div className="observation-body">
                      {observation.categoryCandidates.length > 0 && (
                        <div>
                          <h4>부품 종류 후보</h4>
                          {observation.categoryCandidates.map(
                            (candidate, i) => (
                              <div key={i}>
                                <button
                                  className="text-button"
                                  disabled={busy}
                                  onClick={() =>
                                    void select(
                                      result.selectedVariantId,
                                      candidate.categoryKey as Category,
                                    )
                                  }
                                >
                                  {
                                    categories[
                                      candidate.categoryKey as Category
                                    ]
                                  }{" "}
                                  선택
                                  <ArrowRight size={13} />
                                </button>
                                <p>{candidate.description}</p>
                              </div>
                            ),
                          )}
                        </div>
                      )}
                      {observation.extractedTexts.length > 0 && (
                        <div>
                          <h4>라벨의 글자</h4>
                          {observation.extractedTexts.map((t, i) => (
                            <p key={i}>
                              <code>{t.text}</code>{" "}
                              <small>
                                {t.imageId} ·{" "}
                                {t.legibility === "uncertain"
                                  ? "글자가 불분명해요"
                                  : "선명하게 읽힘"}
                              </small>
                            </p>
                          ))}
                        </div>
                      )}
                      <div>
                        <h4>보이는 특징</h4>
                        {observation.observedFeatures.length ? (
                          observation.observedFeatures.map((f, i) => (
                            <p key={i}>
                              {featureLabels[f.key]} · {f.value}
                            </p>
                          ))
                        ) : (
                          <p>확인할 수 있는 특징이 충분하지 않아요.</p>
                        )}
                      </div>
                      <div>
                        <h4>사진 확인 안내</h4>
                        {observation.qualityIssues.map((q) => (
                          <span className="tag" key={q}>
                            {qualityLabels[q]}
                          </span>
                        ))}
                        <p className="hint">
                          사진만으로 모델·용량을 확정하지 않아요. 아래 제품
                          정보와 대조해 주세요.
                        </p>
                      </div>
                    </div>
                  </details>
                )}
                {result.analysis?.status === "needs_information" &&
                  ["provider_error", "invalid_model_output"].includes(
                    result.analysis.reason,
                  ) && (
                    <div className="alert warning">
                      <CircleHelp size={18} />
                      <span>
                        사진에서 정보를 읽지 못했어요. 아래에서 모델명을
                        선택하거나 다시 사진을 올려 주세요.
                      </span>
                    </div>
                  )}
                {!result.selectedVariantId ? (
                  <div className="product-picker">
                    <div className="step-heading">
                      <span>01</span>
                      <div>
                        <h3>내 물건을 확인해 주세요</h3>
                        <p>
                          {result.candidates.length > 1
                            ? "용량·세대가 다른 후보가 있어요. 라벨과 구매 내역을 보고 선택해 주세요."
                            : result.candidates.length === 0
                              ? result.photoHints?.description ||
                                "입력 정보와 일치하는 모델을 찾지 못했어요. 아래는 전체 등록 제품입니다. 실제 제품과 일치할 때만 선택해 주세요."
                              : "브랜드·용량·입구 형태를 공식 제품 페이지와 대조해 주세요."}
                        </p>
                      </div>
                    </div>
                    <ProductCatalog
                      key={result.id}
                      products={products}
                      category={result.category}
                      candidateIds={(result.candidates.length
                        ? result.candidates
                        : (result.photoHints?.products ?? [])
                      ).map((p) => p.variantId)}
                      candidateLabel={
                        result.candidates.length
                          ? "모델 글자 일치"
                          : "브랜드·용량 참고 후보"
                      }
                      initialQuery={result.query}
                      busy={busy}
                      onSelect={(id) => void select(id)}
                    />
                    <button
                      className="text-button"
                      onClick={() =>
                        document
                          .getElementById("other-paths")
                          ?.scrollIntoView({ behavior: "smooth" })
                      }
                    >
                      내 제품이 없어요 · 다른 방법 보기
                      <ArrowRight size={15} />
                    </button>
                  </div>
                ) : (
                  <div className="confirmed-product">
                    <span className="product-symbol">
                      <Package size={29} />
                    </span>
                    <div>
                      <small>내가 확인한 제품</small>
                      <h3>
                        {result.paths.product?.brand}{" "}
                        {result.paths.product?.modelName}
                      </h3>
                      <p>
                        {result.paths.product?.capacity} ·{" "}
                        {result.paths.product?.region}
                      </p>
                      {result.paths.product?.source.accessNote && (
                        <p>{result.paths.product.source.accessNote}</p>
                      )}
                      <a {...external(result.paths.product!.source.url)}>
                        공식 제품·적용 모델 자료
                        <ArrowUpRight size={14} />
                      </a>
                    </div>
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={() => void select(null)}
                    >
                      다른 제품 선택
                    </button>
                  </div>
                )}
                <div className="result-toolbar">
                  <div className="chips">
                    {Object.entries(categories).map(([k, l]) => (
                      <button
                        key={k}
                        disabled={busy}
                        className={result.category === k ? "selected" : ""}
                        aria-pressed={result.category === k}
                        onClick={() =>
                          void select(result.selectedVariantId, k as Category)
                        }
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                  {result.selectedVariantId && (
                    <button className="text-button" onClick={download}>
                      <Download size={15} />
                      결과 저장
                    </button>
                  )}
                </div>
                {result.selectedVariantId && (
                  <>
                    <div className="route-tabs" aria-label="부품 출처 필터">
                      {[
                        ["all", "전체 부품"],
                        ["oem", "정품"],
                        ["aftermarket", "타사 대체품"],
                      ].map(([key, label]) => (
                        <button
                          key={key}
                          aria-pressed={route === key}
                          className={route === key ? "active" : ""}
                          onClick={() => setRoute(key!)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <div className="parts-grid">
                      {actionable.map((card) => (
                        <article className="part-card" key={card.part.partId}>
                          <div className="card-top">
                            <span
                              className={`tag ${card.part.origin === "oem" ? "green" : "amber"}`}
                            >
                              {card.part.origin === "oem"
                                ? "정품 부품"
                                : card.part.origin === "aftermarket"
                                  ? "타사 대체품"
                                  : "범용 부품"}
                            </span>
                            <span className="small-muted">
                              {card.part.brand}
                            </span>
                          </div>
                          <h3>{card.part.name}</h3>
                          <p
                            className={`review-label ${card.status === "source_supported" ? "green-text" : ""}`}
                          >
                            <ShieldCheck size={16} />
                            {reviewLabels[card.status]}
                          </p>
                          {card.part.specifications.map((s) => (
                            <p className="spec" key={s}>
                              {s}
                            </p>
                          ))}
                          {card.evidence.map((e) => (
                            <div className="evidence" key={e.evidenceId}>
                              <span>
                                <FileText size={14} />
                                {providerLabels[e.provider]}
                              </span>
                              <p>{e.summary}</p>
                              {e.conditions.length > 0 && (
                                <ul>
                                  {e.conditions.map((c) => (
                                    <li key={c}>{c}</li>
                                  ))}
                                </ul>
                              )}
                              <a {...external(e.source.url)}>
                                적용 근거 확인
                                <ArrowUpRight size={13} />
                              </a>
                              <small>
                                {e.source.checkedAt} 내용 확인
                                {card.stale ? " · 재확인 필요" : ""}
                                {e.source.accessNote && (
                                  <>
                                    <br />
                                    {e.source.accessNote}
                                  </>
                                )}
                              </small>
                            </div>
                          ))}
                          {card.offers.map((o) => (
                            <div className="offer" key={o.offerId}>
                              <span>
                                {stockLabels[o.availability.stock]} ·{" "}
                                {o.condition === "used"
                                  ? "중고"
                                  : o.condition === "new"
                                    ? "새상품"
                                    : "상태 미확인"}
                              </span>
                              <small>
                                {o.stock !== "unknown" &&
                                  `주문 상태 확인: ${new Date(o.availability.checkedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}`}
                                {o.availability.expired && o.stock !== "unknown"
                                  ? " · 확인 후 시간이 지나 재확인이 필요해요."
                                  : ""}
                              </small>
                              <strong className="offer-market">
                                {o.market === "domestic"
                                  ? "국내 구매 경로"
                                  : o.market === "overseas"
                                    ? "해외 구매 경로"
                                    : "구매 지역 확인 필요"}
                              </strong>
                              {o.optionLabel && (
                                <p className="offer-option">
                                  구매 옵션: {o.optionLabel}
                                </p>
                              )}
                              <small>
                                {o.region}
                                {o.source.accessNote && (
                                  <>
                                    <br />
                                    {o.source.accessNote}
                                  </>
                                )}
                              </small>
                              <a
                                className="purchase-link"
                                {...external(o.source.url)}
                              >
                                {o.availability.stock === "unavailable"
                                  ? "판매 종료 안내 보기"
                                  : o.availability.stock === "out_of_stock"
                                    ? "품절 상품·재입고 안내 확인"
                                    : `${o.seller}에서 옵션·구매 확인`}
                                <ArrowUpRight size={16} />
                              </a>
                              <small>
                                실시간 재고·배송은 판매처에서 최종 확인하세요.
                              </small>
                            </div>
                          ))}
                          <button
                            className="text-button feedback-link"
                            onClick={() => {
                              setFeedbackPart(card.part.partId);
                              setFeedbackText("");
                              setFeedbackOutcome("not_tested");
                            }}
                          >
                            이 부품의 장착 결과 기록
                          </button>
                        </article>
                      ))}
                    </div>
                    {!actionable.length && (
                      <div className="empty-result">
                        <Search size={26} />
                        <h3>이 조건의 상품은 아직 확인하지 못했어요</h3>
                        <p>
                          제조사가 판매하지 않는다는 뜻은 아닙니다.
                          <br />
                          아래 검색·문의 경로에서 더 찾아볼 수 있어요.
                        </p>
                      </div>
                    )}
                    {excluded.length > 0 && (
                      <details className="exclusions">
                        <summary>
                          <CircleHelp size={16} />
                          선택하면 안 되거나 근거가 충돌하는 부품{" "}
                          {excluded.length}개
                        </summary>
                        {excluded.map((c) => (
                          <div key={c.part.partId}>
                            <strong>
                              {c.part.name} · {reviewLabels[c.status]}
                            </strong>
                            {c.evidence.map((e) => (
                              <p key={e.evidenceId}>
                                {e.summary}{" "}
                                <a {...external(e.source.url)}>
                                  근거 확인
                                  <ArrowUpRight size={12} />
                                </a>
                              </p>
                            ))}
                            {c.part.lifecycle === "discontinued" && (
                              <p>
                                제조사 공식 판매 종료 ·{" "}
                                <a {...external(c.part.lifecycleSource!.url)}>
                                  안내 보기
                                </a>
                              </p>
                            )}
                          </div>
                        ))}
                      </details>
                    )}
                  </>
                )}
                <div className="other-paths" id="other-paths">
                  <div className="step-heading">
                    <span>02</span>
                    <div>
                      <h3>다른 해결 방법도 찾아보세요</h3>
                      <p>
                        실제 상품 페이지와 검색 결과 링크를 구분해서 안내합니다.
                      </p>
                    </div>
                  </div>
                  <div className="path-grid">
                    <article>
                      <span className="path-icon">
                        <SlidersHorizontal size={22} />
                      </span>
                      <h3>규격으로 범용 부품 찾기</h3>
                      <p>
                        모양만으로는 맞는지 알 수 없어요. 아래 정보를 확인해
                        판매처에 문의하세요.
                      </p>
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          void act(async () => {
                            const next = await api<RecordResult>(
                              `/requests/${result.id}/answers`,
                              answers,
                            );
                            setResult(next);
                            setNotice(
                              "확인 내용을 저장했습니다. 입력한 규격만으로 호환을 확정하지 않습니다.",
                            );
                          });
                        }}
                      >
                        <MeasurementGuide category={result.category} />
                        {result.paths.checks.map((c) => (
                          <label className="measurement" key={c.key}>
                            {c.label}
                            <input
                              value={answers[c.key] ?? ""}
                              onChange={(e) =>
                                setAnswers({
                                  ...answers,
                                  [c.key]: e.target.value,
                                })
                              }
                              maxLength={120}
                              placeholder="모르면 비워 두세요"
                            />
                            <small>{c.help}</small>
                          </label>
                        ))}
                        <button
                          className="secondary"
                          disabled={busy}
                          type="submit"
                        >
                          확인 내용 저장
                          <Check size={15} />
                        </button>
                      </form>
                      <a
                        className="search-link"
                        {...external(result.paths.searches[1]!.url)}
                      >
                        범용 부품 검색
                        <ExternalLink size={14} />
                        <span>검색 결과</span>
                      </a>
                    </article>
                    <article>
                      <span className="path-icon">
                        <Wrench size={22} />
                      </span>
                      <h3>구매·수리 경로 더 알아보기</h3>
                      <p>
                        재고가 없거나 부품이 단종됐어도, 중고 부품이나 제조사
                        문의가 도움이 될 수 있어요.
                      </p>
                      {[
                        result.paths.searches[0]!,
                        result.paths.searches[2]!,
                        result.paths.searches[3]!,
                      ].map((s) => (
                        <a
                          className="search-link"
                          key={s.label}
                          {...external(s.url)}
                        >
                          {s.label}
                          <ExternalLink size={14} />
                          <span>검색 결과</span>
                        </a>
                      ))}
                      {result.paths.product && (
                        <a
                          className="search-link contact-link"
                          {...external(result.paths.product.contact.url)}
                        >
                          브랜드 문의 안내
                          <ArrowUpRight size={14} />
                          <span>문의처</span>
                        </a>
                      )}
                      <details className="contact-draft">
                        <summary>문의할 내용 미리 준비하기</summary>
                        <textarea
                          aria-label="제조사 문의 초안"
                          readOnly
                          value={result.paths.contactDraft}
                        />
                        <button
                          className="text-button"
                          onClick={() =>
                            void act(async () => {
                              await navigator.clipboard.writeText(
                                result.paths.contactDraft,
                              );
                              setNotice(
                                "문의 내용을 복사했습니다. 제조사 문의 창에 붙여 넣어 주세요.",
                              );
                            })
                          }
                        >
                          문의 내용 복사
                        </button>
                      </details>
                      <p className="hint">
                        검색 결과의 상품·재고·호환성은 검증되지 않았습니다.
                        판매처가 적은 적용 모델과 규격을 꼭 확인하세요.
                      </p>
                    </article>
                  </div>
                </div>
              </>
            )}
          </section>
        )}
        {!result && (
          <section className="how-it-works">
            <div>
              <span className="section-kicker">HOW IT WORKS</span>
              <h2>
                찾는 과정은 간단하게,
                <br />
                확인은 꼼꼼하게.
              </h2>
            </div>
            {[
              [
                Camera,
                "01",
                "사진으로 관찰",
                "보이는 특징과 라벨의 글자를 읽어요.",
              ],
              [
                CheckCircle2,
                "02",
                "내 제품 확인",
                "용량과 세대를 확인해 같은 제품을 골라요.",
              ],
              [
                Wrench,
                "03",
                "해결 경로 안내",
                "정품부터 대체품, 문의 방법까지 살펴봐요.",
              ],
            ].map(([Icon, n, title, desc]) => {
              const I = Icon as typeof Camera;
              return (
                <article key={String(n)}>
                  <span className="how-number">{String(n)}</span>
                  <I size={23} />
                  <h3>{String(title)}</h3>
                  <p>{String(desc)}</p>
                </article>
              );
            })}
          </section>
        )}
        <section className="promise">
          <ShieldCheck size={24} />
          <p>
            <strong>
              맞는다는 말에는, 확인할 수 있는 근거가 있어야 하니까.
            </strong>
            <span>
              AI는 사진을 관찰하고, 부품의 적용 여부는 출처가 있는 자료로
              안내합니다.
            </span>
          </p>
          <button onClick={() => setModal("guide")}>
            안내 기준
            <ArrowRight size={16} />
          </button>
        </section>
      </main>
      <footer>
        <a href="/" className="brand">
          <Puzzle size={18} />
          딱맞는부품
        </a>
        <span>버리기 전에, 한 번 더 찾아보세요.</span>
        <button onClick={() => setModal("privacy")}>사진·정보 보관 안내</button>
        <small>2026 · 작은 부품, 긴 쓰임</small>
      </footer>
      {modal && (
        <Modal
          title={
            modal === "guide"
              ? "이용 방법과 안내 기준"
              : modal === "privacy"
                ? "사진·정보 보관 안내"
                : modal === "catalog"
                  ? "등록 제품 둘러보기"
                  : "최근 찾기"
          }
          onClose={() => setModal(null)}
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
                      <Clock3 size={18} />
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
                <p>아직 찾기 기록이 없어요.</p>
              )}
              <p className="hint">
                이 브라우저의 기록만 표시하며 최대 24시간 보관합니다.
              </p>
            </>
          ) : modal === "catalog" ? (
            <ProductCatalog
              products={products}
              category={category}
              busy={busy}
              onSelect={(id) =>
                void act(async () => {
                  const product = products.find((p) => p.variantId === id)!;
                  const created = await api<RecordResult>(
                    "/requests",
                    { query: product.modelName, category },
                    "POST",
                    crypto.randomUUID(),
                  );
                  const selected = await api<RecordResult>(
                    `/requests/${created.id}/select`,
                    { variantId: id, category },
                  );
                  setModal(null);
                  show(selected);
                })
              }
            />
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
                <strong>1. 사진 또는 모델명으로 시작</strong>
                <br />
                제품 전체·부품·라벨 사진을 추가하세요. 모델명을 알고 있으면 사진
                없이도 찾을 수 있습니다.
              </p>
              <p>
                <strong>2. 내 제품 확인</strong>
                <br />
                제품의 용량과 입구 형태를 공식 페이지와 대조하세요. 사진이
                비슷한 것만으로 같은 제품이라고 확정하지 않습니다.
              </p>
              <p>
                <strong>3. 근거를 보고 구매·문의</strong>
                <br />
                제품 제조사, 대체 부품 제조사, 판매처의 설명을 구분합니다. “적용
                대상에 명시됨”은 출처의 주장이고 실제 장착·누수 검증을 뜻하지
                않습니다.
              </p>
              <p>
                현재 {catalogCounts.brands}개 브랜드의 제품{" "}
                {catalogCounts.products}개와 부품 {catalogCounts.parts}개를
                제공합니다. 써모스·킨토·조지루시의 국내 뚜껑·패킹·빨대 구매
                경로와 날진·하이드로플라스크의 해외 부품 자료를 확인할 수
                있습니다. 손잡이 단품 등 미등록 부품은 검색·문의 경로로
                이어집니다. 상품 정보는 검수한 카탈로그이며 실시간 웹 전체 검색
                결과가 아닙니다.
              </p>
              <p>
                해외 공식 상품 링크의 국내 배송·가격·재고는 판매 페이지에서
                확인하세요. 구글 검색 링크는 검증된 상품 링크와 구분해
                표시합니다.
              </p>
            </div>
          )}
        </Modal>
      )}
      {feedbackPart && (
        <Modal title="장착 결과 기록" onClose={() => setFeedbackPart("")}>
          <form
            className="feedback-form"
            onSubmit={(e) => {
              e.preventDefault();
              void act(async () => {
                await api(`/requests/${result!.id}/feedback`, {
                  partId: feedbackPart,
                  outcome: feedbackOutcome,
                  conditions: feedbackText,
                  testedAt: new Date().toISOString().slice(0, 10),
                });
                setResult(await api<RecordResult>(`/requests/${result!.id}`));
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
                placeholder="예: 아직 실물 장착 전이며 판매처에 적용 모델을 문의함"
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
}: {
  title: string;
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
      {children}
    </dialog>
  );
}
