import test from "node:test";
import assert from "node:assert/strict";
import { loadCatalog, catalogProducts } from "../server/catalog.js";
import { resolvePaths } from "../server/resolver.js";
import { filterProducts } from "../shared/catalog-search.js";
import { matchCatalogModels } from "../src/catalog.js";
import type { Observation } from "../src/observation.js";
import type { Category } from "../shared/domain.js";
const catalog = loadCatalog();
const products = catalogProducts(catalog);
const supported = (id: string, category: Category) =>
  resolvePaths(catalog, id, category, "")
    .cards.filter((c) =>
      ["check_required", "source_supported"].includes(c.status),
    )
    .map((c) => c.part.partId);
const observe = (text: string): Observation => ({
  categoryCandidates: [],
  observedFeatures: [],
  qualityIssues: [],
  unknownFields: [],
  extractedTexts: [
    { text, imageId: "label", role: "model", legibility: "clear" },
  ],
});

test("cleaning systems preserve explicit manufacturer exclusions", () => {
  assert.deepEqual(supported("vileda-ultramax", "mop_pad"), [
    "vileda-pad-ultramax-refill",
  ]);
  const spray = resolvePaths(catalog, "vileda-spraymax", "mop_pad", "").cards;
  assert.equal(
    spray.find((c) => c.part.partId === "vileda-pad-ultramax-refill")?.status,
    "excluded",
  );
  assert.equal(
    spray.find((c) => c.part.partId === "vileda-pad-h2pro-flat-mop-refill")
      ?.status,
    "excluded",
  );
  assert.deepEqual(supported("vileda-spraymax", "mop_pad"), [
    "vileda-pad-12spray-max-refill-bundle",
  ]);
  assert.equal(
    filterProducts(products, "", { group: "cleaning", category: "mop_pad" })
      .length,
    7,
  );
});

test("PAX frame sizes remain choices and only receive their matching shelf", () => {
  assert.equal(
    matchCatalogModels(observe("PAX"), catalog.products).candidates.length,
    6,
  );
  for (const [size, part] of [
    ["50x35", "20277993"],
    ["50x58", "10277960"],
    ["75x35", "50277996"],
    ["75x58", "70277962"],
    ["100x35", "80277990"],
    ["100x58", "50277958"],
  ]) {
    assert.deepEqual(supported(`ikea-pax-${size}`, "shelf"), [
      `ikea-komplement-${part}`,
    ]);
  }
  assert.deepEqual(supported("ikea-billy-30522041", "shelf"), [
    "ikea-shelf-50525270",
  ]);
  assert.equal(
    filterProducts(products, "", {
      group: "plumbing",
      category: "sink_stopper",
      domesticOnly: true,
    }).length,
    2,
  );
});

test("label printer suffixes and multicolour refill codes are not collapsed", () => {
  assert.deepEqual(
    matchCatalogModels(observe("PT-H110BK"), catalog.products).candidates.map(
      (p) => p.variantId,
    ),
    ["brother-pt-h110bk"],
  );
  assert.deepEqual(
    matchCatalogModels(observe("PT-H110"), catalog.products).candidates.map(
      (p) => p.variantId,
    ),
    ["brother-pt-h110"],
  );
  assert.deepEqual(supported("brother-pt-d200", "label_tape"), [
    "brother-tze-231",
  ]);
  assert.deepEqual(supported("uni-sxe3-400", "refill"), ["uni-sxr-80-07"]);
  assert.equal(supported("brother-pt-p300bt", "refill").length, 0);
});

test("new sewing, cutter and pet parts never inherit a brand-wide compatibility claim", () => {
  assert.deepEqual(supported("singer-4423", "bobbin"), [
    "singer-class-15-transparent",
  ]);
  assert.ok(
    !supported("singer-221", "bobbin").includes("singer-class-15-transparent"),
  );
  assert.deepEqual(supported("olfa-a-1", "blade"), ["olfa-abb-10b"]);
  assert.deepEqual(supported("petsafe-stainless-multi-pet", "filter"), [
    "petsafe-pac00-13711",
  ]);
  assert.ok(
    !supported("petsafe-platinum", "filter").includes("petsafe-pac00-13906"),
  );
  assert.deepEqual(supported("bugaboo-bee-5", "wheel"), ["bugaboo-500525"]);
  assert.deepEqual(supported("bugaboo-fox-3", "wheel"), ["bugaboo-230562"]);
});
