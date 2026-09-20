import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import multer from "multer";
import { z } from "zod";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { timingSafeEqual, createHash } from "node:crypto";
import {
  categories,
  categorySchema,
  productGroupSchema,
  productGroups,
  answerSchema,
  feedbackSchema,
  checks,
  type Catalog,
} from "../shared/domain.js";
import type { AnalysisResult, ObservationRequest } from "../src/analysis.js";
import { normalizeModel } from "../src/catalog.js";
import { Store, type StoredRequest } from "./store.js";
import { normalizeImage } from "./images.js";
import { photoHints } from "./photo-hints.js";
import { resolvePaths } from "./resolver.js";
import { catalogProducts } from "./catalog.js";
import { filterProducts } from "../shared/catalog-search.js";

type Analyzer = (request: ObservationRequest) => Promise<AnalysisResult>;
interface Options {
  store: Store;
  catalog: Catalog;
  analyze?: Analyzer;
  origin: string;
  production?: boolean;
  dailyLimit?: number;
  worker?: boolean;
}
class InputError extends Error {}
class ConflictError extends Error {}
export function createApp({
  store,
  catalog,
  analyze,
  origin,
  production = false,
  dailyLimit = 100,
  worker = true,
}: Options) {
  const app = express();
  app.disable("x-powered-by");
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "blob:", "data:"],
          connectSrc: ["'self'"],
          upgradeInsecureRequests: production ? [] : null,
        },
      },
      strictTransportSecurity: production ? undefined : false,
    }),
  );
  app.use(cookieParser());
  app.use(express.json({ limit: "16kb" }));
  // The proxy must preserve the public Origin. Forwarded IP headers are intentionally not trusted.
  app.use("/api", (req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    if (!store.quota([{ key: `http:${req.ip}`, max: 240 }], 60000))
      return res.status(429).json({ error: "잠시 후 다시 시도해 주세요." });
    next();
  });
  app.get("/api/health", (_req, res) =>
    res.json({ ok: true, photoAnalysisAvailable: !!analyze }),
  );
  app.get("/api/session", (req, res) => {
    const existing = store.session(req.cookies?.parts_session);
    const session = existing ?? store.newSession();
    if ("token" in session)
      res.cookie("parts_session", session.token, {
        httpOnly: true,
        sameSite: "strict",
        secure: production,
        maxAge: 86400000,
        path: "/",
      });
    res.json({
      csrf: session.csrf,
      photoAnalysisAvailable: !!analyze,
      retentionHours: 24,
    });
  });
  app.use("/api", (req, res, next) => {
    const session = store.session(req.cookies?.parts_session);
    if (!session)
      return res
        .status(401)
        .json({ error: "세션이 만료되었습니다. 페이지를 새로고침해 주세요." });
    res.locals.owner = session.id;
    if (!["GET", "HEAD"].includes(req.method)) {
      const csrf = req.get("x-csrf-token") ?? "";
      if (
        req.get("origin") !== origin ||
        !/^[a-f0-9]{64}$/.test(csrf) ||
        !timingSafeEqual(Buffer.from(csrf), Buffer.from(session.csrf))
      )
        return res.status(403).json({
          error: "요청 출처를 확인할 수 없습니다. 새로고침해 주세요.",
        });
    }
    next();
  });
  app.get("/api/catalog", (req, res) => {
    const query =
      typeof req.query.q === "string" ? req.query.q.slice(0, 120) : "";
    res.json({
      updatedAt: catalog.updatedAt,
      categories,
      productGroups,
      counts: {
        products: catalog.products.length,
        groups: new Set(catalog.products.map((p) => p.group)).size,
        parts: catalog.parts.length,
        brands: new Set(catalog.products.map((p) => p.brand)).size,
      },
      products: filterProducts(catalogProducts(catalog), query, {
        group: productGroupSchema.safeParse(req.query.group).data,
        brand: typeof req.query.brand === "string" ? req.query.brand : "",
        capacity:
          typeof req.query.capacity === "string" ? req.query.capacity : "",
        category: categorySchema.safeParse(req.query.category).data,
        domesticOnly: req.query.domestic === "true",
        orderableOnly: req.query.orderable === "true",
      }),
    });
  });
  const present = (record: StoredRequest) => {
    const { owner, ...safe } = record;
    const suggested =
      record.analysis && "candidateVariantIds" in record.analysis
        ? record.analysis.candidateVariantIds
        : [];
    const candidates = catalog.products.filter(
      (p) =>
        suggested.includes(p.variantId) ||
        (record.query &&
          [p.modelName, ...p.aliases].some(
            (a) => normalizeModel(a) === normalizeModel(record.query),
          )),
    );
    return {
      ...safe,
      candidates,
      photoHints: photoHints(
        candidates.length === 0 &&
          record.analysis &&
          "observation" in record.analysis
          ? record.analysis.observation
          : undefined,
        catalog.products,
      ),
      paths: resolvePaths(
        catalog,
        record.selectedVariantId,
        record.category,
        record.query,
        record.answers,
        record.group,
      ),
    };
  };
  app.get("/api/requests", (_req, res) =>
    res.json(
      store.list(res.locals.owner).map((r) => ({
        id: r.id,
        createdAt: r.createdAt,
        state: r.state,
        category: r.category,
        label: r.selectedVariantId
          ? catalog.products.find((p) => p.variantId === r.selectedVariantId)
              ?.modelName
          : r.query || "사진으로 부품 찾기",
      })),
    ),
  );
  const bodySchema = z.strictObject({
    query: z.string().trim().max(120).default(""),
    category: categorySchema.default("lid"),
    group: productGroupSchema.optional(),
    demo: z.boolean().optional(),
  });
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 10 * 1024 * 1024,
      files: 4,
      fields: 4,
      fieldSize: 2048,
      parts: 8,
    },
  }).array("images", 4);
  let accepting = 0;
  app.post(
    "/api/requests",
    (req, res, next) => {
      if (accepting >= 2)
        return res
          .status(429)
          .json({ error: "사진을 처리 중입니다. 잠시 후 다시 시도해 주세요." });
      if (
        !store.quota(
          [
            { key: `create:${res.locals.owner}`, max: 30 },
            { key: `create-ip:${req.ip}`, max: 60 },
          ],
          3600000,
        )
      )
        return res.status(429).json({
          error: "요청 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.",
        });
      accepting++;
      let released = false;
      const release = () => {
        if (!released) {
          accepting--;
          released = true;
        }
      };
      res.once("finish", release);
      res.once("close", release);
      next();
    },
    upload,
    async (req, res) => {
      const idempotencyKey = z
        .string()
        .uuid()
        .optional()
        .parse(req.get("idempotency-key"));
      let query = "",
        category: z.infer<typeof categorySchema> = "other",
        group: z.infer<typeof productGroupSchema> | undefined,
        payload: ObservationRequest | undefined;
      if (req.is("multipart/form-data")) {
        const fields = z
          .strictObject({
            query: z.string().trim().max(120).default(""),
            category: categorySchema,
            group: productGroupSchema.optional(),
            roles: z.string().max(200),
          })
          .parse(req.body);
        query = fields.query;
        category = fields.category;
        group = fields.group;
        const files = req.files as Express.Multer.File[];
        let rawRoles: unknown;
        try {
          rawRoles = JSON.parse(fields.roles);
        } catch {
          throw new InputError("사진 역할을 확인해 주세요.");
        }
        const roles = z
          .array(z.enum(["full", "part", "label"]))
          .min(1)
          .max(4)
          .parse(rawRoles);
        if (files.length !== roles.length)
          return res
            .status(400)
            .json({ error: "사진과 역할 개수가 다릅니다." });
        const images = [];
        for (let i = 0; i < files.length; i++) {
          let bytes: Awaited<ReturnType<typeof normalizeImage>>;
          try {
            bytes = await normalizeImage(files[i]!.buffer, roles[i]!);
          } catch {
            throw new InputError("사진 파일 형식을 확인해 주세요.");
          }
          images.push({
            imageId: `image-${i + 1}`,
            role: roles[i]!,
            format: "jpeg" as const,
            bytes,
          });
        }
        payload = { images, allowedCategoryKeys: Object.keys(categories) };
      } else {
        const body = bodySchema.parse(req.body);
        query = body.query;
        category = body.category;
        group = body.group;
        if (body.demo)
          payload = {
            allowedCategoryKeys: Object.keys(categories),
            images: [
              {
                imageId: "image-1",
                role: "full",
                format: "jpeg",
                bytes: await readFile(
                  resolve("tests/fixtures/public-water-bottle.jpg"),
                ),
              },
            ],
          };
        else if (!query)
          return res
            .status(400)
            .json({ error: "모델명을 입력하거나 사진을 추가해 주세요." });
      }
      const requestHash = createHash("sha256")
        .update(
          JSON.stringify({
            query,
            category,
            group,
            images:
              payload?.images.map((i) => ({
                role: i.role,
                sha: createHash("sha256").update(i.bytes).digest("hex"),
              })) ?? [],
          }),
        )
        .digest("hex");
      if (idempotencyKey) {
        const duplicate = store.duplicate(res.locals.owner, idempotencyKey);
        if (duplicate) {
          if (duplicate.hash !== requestHash)
            return res.status(409).json({
              error:
                "같은 요청 키에 다른 입력이 전달되었습니다. 새로고침 후 다시 시도해 주세요.",
            });
          const previous = store.get(duplicate.request_id, res.locals.owner);
          return previous
            ? res.json(present(previous))
            : res.status(410).json({
                error:
                  "이미 삭제한 요청입니다. 새로고침 후 새 요청을 시작해 주세요.",
              });
        }
      }
      if (payload) {
        if (!analyze)
          return res.status(503).json({
            error:
              "사진 분석 연결을 준비 중입니다. 모델명으로 찾기를 이용해 주세요.",
          });
        if (store.pendingCount() >= 10)
          return res.status(429).json({
            error: "분석 대기가 많습니다. 잠시 후 다시 시도해 주세요.",
          });
        // Each request can make at most two provider calls; the global cap includes schema retries.
        if (
          !store.quota(
            [
              { key: "ai-global", max: dailyLimit },
              { key: `ai:${res.locals.owner}`, max: 20 },
              { key: `ai-ip:${req.ip}`, max: 40 },
            ],
            86400000,
          )
        )
          return res.status(429).json({
            error:
              "오늘의 사진 분석 한도에 도달했습니다. 모델명으로 찾기를 이용해 주세요.",
          });
      }
      const record = store.create(
        res.locals.owner,
        query,
        category,
        payload,
        idempotencyKey ? { key: idempotencyKey, hash: requestHash } : undefined,
        group,
      );
      res.status(201).json(present(record));
      void tick();
    },
  );
  const owned = (req: Request, res: Response) => {
    const record = store.get(String(req.params.id), res.locals.owner);
    if (
      record &&
      req.method === "POST" &&
      req.get("if-match") &&
      req.get("if-match") !== String(record.revision)
    )
      throw new ConflictError(
        "다른 화면에서 기록이 변경되었습니다. 새로고침한 뒤 다시 입력해 주세요.",
      );
    return record;
  };
  app.get("/api/requests/:id", (req, res) => {
    const r = owned(req, res);
    if (!r)
      return res
        .status(404)
        .json({ error: "찾기 기록이 없거나 만료되었습니다." });
    res.json(present(r));
  });
  app.post("/api/requests/:id/select", (req, res) => {
    const r = owned(req, res);
    if (!r) return res.status(404).json({ error: "기록을 찾을 수 없습니다." });
    if (r.state !== "ready")
      return res
        .status(409)
        .json({ error: "분석이 끝나면 제품을 선택해 주세요." });
    const body = z
      .strictObject({
        variantId: z.string().nullable(),
        category: categorySchema,
      })
      .parse(req.body);
    if (
      body.variantId &&
      !catalog.products.some((p) => p.variantId === body.variantId)
    )
      return res.status(400).json({ error: "등록되지 않은 제품입니다." });
    if (r.category !== body.category) r.answers = {};
    if (r.selectedVariantId !== body.variantId) {
      r.answers = {};
      r.feedback = [];
    }
    r.category = body.category;
    r.selectedVariantId = body.variantId;
    if (body.variantId)
      r.group = catalog.products.find(
        (p) => p.variantId === body.variantId,
      )!.group;
    store.save(r);
    res.json(present(r));
  });
  app.post("/api/requests/:id/answers", (req, res) => {
    const r = owned(req, res);
    if (!r) return res.status(404).json({ error: "기록을 찾을 수 없습니다." });
    const answers = answerSchema.parse(req.body);
    if (
      Object.keys(answers).some(
        (key) => !checks[r.category].some((c) => c.key === key),
      )
    )
      return res
        .status(400)
        .json({ error: "해당 부품의 확인 항목을 입력해 주세요." });
    r.answers = answers;
    store.save(r);
    res.json(present(r));
  });
  app.post("/api/requests/:id/feedback", (req, res) => {
    const r = owned(req, res);
    if (!r) return res.status(404).json({ error: "기록을 찾을 수 없습니다." });
    const feedback = feedbackSchema.parse(req.body);
    if (
      !r.selectedVariantId ||
      !catalog.evidence.some(
        (e) =>
          e.variantId === r.selectedVariantId && e.partId === feedback.partId,
      ) ||
      feedback.testedAt > new Date().toISOString().slice(0, 10)
    )
      return res
        .status(400)
        .json({ error: "제품·부품·확인 날짜를 확인해 주세요." });
    r.feedback = [
      ...r.feedback
        .filter((f) => (f as { partId: string }).partId !== feedback.partId)
        .slice(-9),
      {
        ...feedback,
        variantId: r.selectedVariantId,
        verification: "user_report_unverified",
      },
    ];
    store.save(r);
    res.status(201).json({ saved: true });
  });
  app.delete("/api/requests/:id", (req, res) => {
    store.delete(String(req.params.id), res.locals.owner);
    res.status(204).end();
  });
  app.use("/api", (_req, res) =>
    res.status(404).json({ error: "요청 경로를 찾을 수 없습니다." }),
  );
  app.get("/demo-bottle.jpg", (_req, res) =>
    res.sendFile(resolve("tests/fixtures/public-water-bottle.jpg")),
  );
  app.use(express.static(resolve("dist"), { index: false }));
  app.get("/{*path}", (_req, res) => res.sendFile(resolve("dist/index.html")));
  app.use(
    (error: unknown, _req: Request, res: Response, _next: NextFunction) => {
      if (error instanceof ConflictError)
        return res.status(409).json({ error: error.message });
      const uploadError = error instanceof multer.MulterError;
      const bodyError =
        error &&
        typeof error === "object" &&
        "type" in error &&
        ["entity.parse.failed", "entity.too.large"].includes(
          String(error.type),
        );
      const inputError =
        uploadError ||
        error instanceof z.ZodError ||
        error instanceof InputError ||
        bodyError;
      if (!inputError)
        console.error(
          JSON.stringify({ event: "request_error", code: "internal_error" }),
        );
      res
        .status(
          uploadError && error.code === "LIMIT_FILE_SIZE"
            ? 413
            : inputError
              ? 400
              : 500,
        )
        .json({
          error: uploadError
            ? "사진은 최대 4장, 한 장당 10MB까지 가능합니다."
            : inputError
              ? "입력 형식 또는 사진 파일을 확인해 주세요. JPG·PNG·WebP를 지원합니다."
              : "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.",
        });
    },
  );
  let active = 0,
    stopped = false;
  async function tick() {
    if (stopped || !analyze || active >= 2) return;
    const job = store.next();
    if (!job) return;
    active++;
    try {
      const analysis = await analyze(job.payload);
      const r = store.get(job.record.id);
      if (r) {
        r.analysis = analysis;
        r.state = "ready";
        store.save(r);
      }
    } catch {
      const r = store.get(job.record.id);
      if (r) {
        r.state = "ready";
        r.analysis = {
          status: "needs_information",
          reason: "provider_error",
          attempts: 1,
          nextAction: { kind: "model_search", label: "모델명으로 찾기" },
        };
        store.save(r);
      }
    } finally {
      store.clearPayload(job.record.id);
      active--;
      if (!stopped) void tick();
    }
  }
  const timer = worker ? setInterval(() => void tick(), 500) : undefined;
  timer?.unref();
  const cleanup = worker
    ? setInterval(() => store.cleanup(), 60000)
    : undefined;
  cleanup?.unref();
  return {
    app,
    tick,
    stop: async () => {
      stopped = true;
      clearInterval(timer);
      clearInterval(cleanup);
      while (active) await new Promise((r) => setTimeout(r, 50));
    },
  };
}
