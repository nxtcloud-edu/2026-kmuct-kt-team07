import test from "node:test";
import assert from "node:assert/strict";
import { searchIntent } from "../shared/search-intent.js";
import { filterProducts, suggestProducts } from "../shared/catalog-search.js";
import { productKind, kindsIn } from "../shared/product-kind.js";
import { productGroups } from "../shared/domain.js";
import { loadCatalog, catalogProducts } from "../server/catalog.js";
import { photoHints } from "../server/photo-hints.js";
import type { Observation } from "../src/observation.js";
import { once } from "node:events";
import { createApp } from "../server/app.js";
import { Store } from "../server/store.js";

const catalog = loadCatalog(),
  products = catalogProducts(catalog);
const observe = (
  features: Observation["observedFeatures"],
  texts: Observation["extractedTexts"] = [],
): Observation => ({
  categoryCandidates: [],
  extractedTexts: texts,
  observedFeatures: features,
  qualityIssues: [],
  unknownFields: ["model"],
});

test("natural product plus part queries retain the requested part and find the appliance", () => {
  assert.deepEqual(searchIntent("삼성 공기청정기 필터").category, "filter");
  assert.equal(searchIntent("AX34A5310WWD 필터").productQuery, "AX34A5310WWD");
  assert.deepEqual(
    filterProducts(products, "AX34A5310WWD 필터").map((p) => p.variantId),
    ["samsung-ax34a5310wwd"],
  );
  assert.ok(filterProducts(products, "공기청정기 필터").length > 0);
  assert.equal(searchIntent("TP04 필터", "remote").category, "remote");
});

test("everyday product names find models whose catalog names are only codes", () => {
  const samsung = filterProducts(products, "삼성 공기청정기 필터");
  assert.ok(samsung.length > 0);
  assert.ok(
    samsung.every((p) => p.brand === "삼성" && p.kind === "공기청정기"),
  );
  assert.ok(
    filterProducts(products, "다이슨 청소기").every((p) => p.kind === "청소기"),
  );
  assert.ok(filterProducts(products, "다이슨 청소기").length > 0);
  assert.ok(filterProducts(products, "써모스 텀블러 패킹").length > 0);
  assert.ok(filterProducts(products, "필립스 전동칫솔 칫솔모").length > 0);
  assert.equal(filterProducts(products, "삼성 세탁기").length, 0);
});

test("every catalog product has an everyday kind, not just its group label", () => {
  const groupLabels = new Set<string>(Object.values(productGroups));
  const unnamed = catalog.products.filter((p) =>
    groupLabels.has(productKind(p).kind),
  );
  assert.deepEqual(
    unnamed.map((p) => p.variantId),
    [],
  );
  assert.deepEqual(kindsIn("흰색 원통형 공기 청정기"), ["공기청정기"]);
  assert.deepEqual(kindsIn("펜던트 조명"), []);
});

test("search suggestions put the typed model first and survive a missing part type", () => {
  assert.equal(
    suggestProducts(products, "AX34A5310WWD 필터")[0]?.variantId,
    "samsung-ax34a5310wwd",
  );
  assert.equal(
    suggestProducts(products, "PT-D200")[0]?.variantId,
    "brother-pt-d200",
  );
  assert.deepEqual(suggestProducts(products, "   "), []);
  assert.ok(suggestProducts(products, "텀블러", 6).length === 6);
  // The catalog has no remote for this purifier: still offer the product.
  const fallback = suggestProducts(products, "AX34A5310WWD 리모컨");
  assert.equal(fallback[0]?.variantId, "samsung-ax34a5310wwd");
});

test("an unlabeled appliance photo yields only explicit estimates, never exact identity", () => {
  const observation = observe([
    { key: "product_type", value: "공기청정기", imageId: "full" },
    { key: "appearance", value: "원통형 몸체", imageId: "full" },
  ]);
  const hints = photoHints(observation, catalog.products, {
    category: "filter",
    catalog,
  });
  assert.ok(hints.products.length > 0 && hints.products.length <= 8);
  assert.ok(hints.products.every((p) => productKind(p).kind === "공기청정기"));
  // A product type alone spans brands: the shortlist must not be one family.
  assert.ok(new Set(hints.products.map((p) => p.brand)).size > 1);
  assert.match(hints.description, /추정/);
  assert.match(hints.description, /모델이 확인된 것은 아니/);
  assert.deepEqual(observation.extractedTexts, []);
  assert.equal(
    photoHints(
      observe([{ key: "appearance", value: "흰색", imageId: "full" }]),
      catalog.products,
    ).products.length,
    0,
  );
});

test("a brand logo or a cropped code moves the likeliest product to the top", () => {
  const branded = photoHints(
    observe(
      [{ key: "product_type", value: "공기청정기", imageId: "full" }],
      [
        {
          text: "SAMSUNG",
          imageId: "full",
          role: "brand",
          legibility: "clear",
        },
      ],
    ),
    catalog.products,
  );
  assert.ok(branded.products.length > 0);
  assert.ok(branded.products.every((p) => p.brand === "삼성"));
  const cropped = photoHints(
    observe(
      [{ key: "product_type", value: "공기청정기", imageId: "label" }],
      [
        {
          text: "AX34A53",
          imageId: "label",
          role: "model",
          legibility: "uncertain",
        },
      ],
    ),
    catalog.products,
  );
  assert.equal(cropped.products[0]?.variantId, "samsung-ax34a5310wwd");
  assert.match(cropped.reasons["samsung-ax34a5310wwd"]!.join(" "), /AX34A53/);
  // Too short to mean anything: three characters match hundreds of codes.
  assert.equal(
    photoHints(
      observe(
        [],
        [{ text: "AX3", imageId: "label", role: "model", legibility: "clear" }],
      ),
      catalog.products,
    ).products.length,
    0,
  );
});

test("a logo read with doubt orders the shortlist but never claims the brand", () => {
  const hints = photoHints(
    observe(
      [{ key: "product_type", value: "공기청정기", imageId: "full" }],
      [{ text: "LG", imageId: "full", role: "brand", legibility: "uncertain" }],
    ),
    catalog.products,
    { category: "filter", catalog },
  );
  assert.ok(hints.products.length > 0 && hints.products.length <= 8);
  assert.equal(hints.products[0]!.brand, "LG");
  assert.match(
    hints.reasons[hints.products[0]!.variantId]!.join(" "),
    /로 보이는 로고/,
  );
  // The same doubtful logo with nothing else visible is not enough to suggest.
  assert.equal(
    photoHints(
      observe(
        [],
        [
          {
            text: "LG",
            imageId: "full",
            role: "brand",
            legibility: "uncertain",
          },
        ],
      ),
      catalog.products,
    ).products.length,
    0,
  );
});

test("a typed model code followed by a part word identifies the product and the part", async () => {
  const origin = "http://localhost:3001";
  const store = new Store(":memory:");
  const service = createApp({ store, catalog, origin, worker: false });
  const server = service.app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    const session = await fetch(base + "/api/session");
    const headers = {
      cookie: session.headers.get("set-cookie")!.split(";")[0]!,
      "x-csrf-token": (await session.json()).csrf,
      origin,
      "content-type": "application/json",
    };
    const post = async (query: string) =>
      (
        await fetch(base + "/api/requests", {
          method: "POST",
          headers,
          body: JSON.stringify({ query, category: "other" }),
        })
      ).json();
    const exact = await post("AX34A5310WWD 필터");
    assert.equal(exact.category, "filter");
    assert.deepEqual(
      exact.candidates.map((p: { variantId: string }) => p.variantId),
      ["samsung-ax34a5310wwd"],
    );
    // A product type is a search, not a model code: nothing is pre-selected.
    const natural = await post("삼성 공기청정기 필터");
    assert.equal(natural.category, "filter");
    assert.equal(natural.candidates.length, 0);
    const catalogResponse = await (
      await fetch(base + "/api/catalog", { headers })
    ).json();
    assert.equal(
      catalogResponse.products.find(
        (p: { variantId: string }) => p.variantId === "samsung-ax34a5310wwd",
      ).kind,
      "공기청정기",
    );
  } finally {
    server.close();
    await service.stop();
    store.close();
  }
});
