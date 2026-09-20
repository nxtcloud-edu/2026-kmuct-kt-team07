import test from "node:test";
import assert from "node:assert/strict";
import { loadCatalog, catalogProducts } from "../server/catalog.js";
import { filterProducts } from "../shared/catalog-search.js";
import { resolvePaths } from "../server/resolver.js";
import { matchCatalogModels } from "../src/catalog.js";

const catalog = loadCatalog();
const products = catalogProducts(catalog);
test("catalog discovery handles Korean/English aliases, spacing, hyphens and fullwidth input", () => {
  for (const q of [
    "써모스 JNL 505K",
    "thermos jnl-505k",
    "ＪＮＬ－５０５Ｋ",
    "써모스 뉴 데일리 500 ml",
  ]) {
    assert.deepEqual(
      filterProducts(products, q).map((p) => p.variantId),
      ["thermos-jnl-505k"],
    );
  }
  assert.equal(filterProducts(products, "존재하지 않는 제품").length, 0);
  assert.equal(
    filterProducts(products, "", {
      brand: "써모스",
      capacity: "550ml",
      category: "straw",
      domesticOnly: true,
    })[0]?.variantId,
    "thermos-fhl-550k",
  );
  assert.equal(
    filterProducts(products, "", { category: "handle", domesticOnly: true })
      .length,
    0,
  );
});
test("every added Korean model has an attributed part and a domestic purchase path", () => {
  for (const product of products.filter((p) => p.brand === "써모스")) {
    assert.ok(product.domesticCategories.length, product.variantId);
    for (const category of product.domesticCategories) {
      const paths = resolvePaths(catalog, product.variantId, category, "");
      assert.ok(
        paths.cards.some(
          (c) =>
            c.evidence.some(
              (e) =>
                e.provider === "product_manufacturer" &&
                e.source.scope === "content_reviewed",
            ) &&
            c.offers.some(
              (o) =>
                o.market === "domestic" &&
                new URL(o.source.url).hostname === "thermosshop.kr",
            ),
        ),
      );
    }
  }
});
test("shared gaskets do not imply shared caps across JOW or JOS capacities", () => {
  for (const family of ["jow", "jos"]) {
    const first = family === "jow" ? "600" : "400";
    const other = family === "jow" ? "800" : "750";
    const result = resolvePaths(
      catalog,
      `thermos-${family}-${first}k`,
      "lid",
      "",
    );
    assert.ok(
      result.cards.some(
        (c) => c.part.partId === `thermos-${family}-lid-${first}`,
      ),
    );
    assert.ok(
      !result.cards.some(
        (c) => c.part.partId === `thermos-${family}-lid-${other}`,
      ),
    );
    assert.equal(
      resolvePaths(catalog, `thermos-${family}-${first}k`, "gasket", "")
        .cards[0]?.part.partId,
      `thermos-${family}-gasket`,
    );
  }
});
test("FHL straw options remain capacity-specific and require option confirmation", () => {
  for (const capacity of [400, 550]) {
    const result = resolvePaths(
      catalog,
      `thermos-fhl-${capacity}k`,
      "straw",
      "",
    );
    assert.equal(result.cards.length, 1);
    const card = result.cards[0]!;
    assert.equal(card.status, "check_required");
    assert.match(card.offers[0]!.optionLabel!, new RegExp(String(capacity)));
    assert.equal(card.offers[0]!.stock, "unknown");
  }
});
test("discovery metadata does not promote exclusions or conflicting evidence", () => {
  const copy = structuredClone(catalog);
  const e = copy.evidence.find(
    (e) =>
      e.variantId === "thermos-fhl-400k" &&
      e.partId === "thermos-fhl-straw-400",
  )!;
  copy.evidence.push({
    ...e,
    evidenceId: "conflicting-straw",
    claim: "excludes",
  });
  assert.ok(
    !catalogProducts(copy)
      .find((p) => p.variantId === e.variantId)!
      .domesticCategories.includes("straw"),
  );
});
test("OCR exact aliases retain multiple capacities; partial discovery never identifies a model", () => {
  const observation = (text: string) => ({
    categoryCandidates: [],
    extractedTexts: [
      {
        text,
        imageId: "label",
        role: "model" as const,
        legibility: "clear" as const,
      },
    ],
    observedFeatures: [],
    qualityIssues: [],
    unknownFields: [],
  });
  assert.equal(
    matchCatalogModels(observation("JNL"), catalog.products).candidates.length,
    5,
  );
  assert.equal(
    matchCatalogModels(observation("JNL-505K"), catalog.products).candidates[0]
      ?.variantId,
    "thermos-jnl-505k",
  );
  assert.equal(
    matchCatalogModels(observation("JNL-50"), catalog.products).candidates
      .length,
    0,
  );
});

test("new Korean and English brand aliases keep similarly named bottle families separate", () => {
  for (const q of ["킨토 워터보틀 950ml", "KINTO WATER BOTTLE 950 ml"]) {
    assert.deepEqual(
      filterProducts(products, q).map((p) => p.variantId),
      ["kinto-water-bottle-950"],
    );
  }
  assert.deepEqual(
    filterProducts(products, "조지루시 SM VB 720ml").map((p) => p.variantId),
    ["zojirushi-sm-vb72"],
  );
  assert.equal(
    filterProducts(products, "액티브", {
      brand: "킨토",
      category: "gasket",
      domesticOnly: true,
    }).length,
    4,
  );
  for (const p of products.filter((p) =>
    ["킨토", "조지루시"].includes(p.brand),
  )) {
    assert.ok(p.domesticCategories.length > 0, p.variantId);
    const paths = resolvePaths(
      catalog,
      p.variantId,
      p.domesticCategories[0]!,
      "",
    );
    assert.ok(
      paths.cards.some(
        (c) =>
          c.status === "check_required" &&
          c.offers.some((o) => o.market === "domestic"),
      ),
    );
  }
});
test("KINTO volume-specific straws and explicit cap exclusions survive stock changes", () => {
  for (const [family, sizes, partIds] of [
    ["play", [300, 480], [80370, 80368]],
    ["togo-bottle", [360, 480], [80059, 80060]],
  ] as const) {
    for (const [index, size] of sizes.entries()) {
      const cards = resolvePaths(
        catalog,
        `kinto-${family}-${size}`,
        "straw",
        "",
      ).cards;
      assert.deepEqual(
        cards.filter((c) => c.status !== "excluded").map((c) => c.part.partId),
        [`kinto-${partIds[index]}`],
      );
    }
  }
  const soldOut = resolvePaths(
    catalog,
    "kinto-play-480",
    "straw",
    "",
  ).cards.find((c) => c.part.partId === "kinto-80368")!;
  assert.equal(soldOut.status, "check_required");
  assert.equal(soldOut.offers[0]?.stock, "out_of_stock");
  const water = resolvePaths(
    catalog,
    "kinto-water-bottle-950",
    "lid",
    "",
  ).cards;
  assert.equal(
    water.find((c) => c.part.partId === "kinto-80132")?.status,
    "excluded",
  );
  assert.equal(
    water.find((c) => c.part.partId === "kinto-80151")?.status,
    "excluded",
  );
  assert.equal(
    water.find((c) => c.part.partId === "kinto-80397")?.status,
    "check_required",
  );
});
test("Korean reseller attribution and Zojirushi model-specific assemblies remain explicit", () => {
  assert.ok(
    catalog.evidence
      .filter((e) => e.partId.startsWith("kinto-"))
      .every((e) => e.provider === "seller"),
  );
  const vb = resolvePaths(catalog, "zojirushi-sm-vb72", "lid", "").cards;
  assert.deepEqual(
    vb.map((c) => c.part.partId),
    ["zojirushi-bb780807l"],
  );
  assert.ok(
    vb[0]?.evidence.every((e) => e.provider === "product_manufacturer"),
  );
  assert.deepEqual(
    resolvePaths(catalog, "zojirushi-su-ba48", "lid", "").cards.map(
      (c) => c.part.partId,
    ),
    ["zojirushi-s110"],
  );
});
