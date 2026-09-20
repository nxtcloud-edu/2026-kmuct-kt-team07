import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { photoHints } from "../server/photo-hints.js";
import { loadCatalog } from "../server/catalog.js";
import { normalizeImage } from "../server/images.js";
import { normalizeModel, matchCatalogModels } from "../src/catalog.js";
import { offerAvailability, offerPriority } from "../shared/availability.js";
import type { Observation } from "../src/observation.js";
const catalog = loadCatalog();
const observe = (brand: string, capacity: string): Observation => ({
  categoryCandidates: [],
  observedFeatures: [],
  qualityIssues: [],
  unknownFields: [],
  extractedTexts: [
    { imageId: "label", role: "brand", text: brand, legibility: "clear" },
    { imageId: "label", role: "capacity", text: capacity, legibility: "clear" },
  ],
});

test("brand and capacity hints support liter labels without claiming an exact model", () => {
  const o = observe("ＫＩＮＴＯ", "0.5 L");
  assert.deepEqual(
    photoHints(o, catalog.products).products.map((p) => p.variantId),
    ["kinto-water-bottle-500"],
  );
  assert.equal(matchCatalogModels(o, catalog.products).candidates.length, 0);
  assert.match(
    photoHints(o, catalog.products).description,
    /모델이 확인된 것은 아니/,
  );
  assert.equal(
    photoHints(observe("KINTO", "500 oz"), catalog.products).products.length,
    0,
  );
});
test("conflicting or uncertain readings cannot silently select a photo hint", () => {
  const o = observe("KINTO", "500ml");
  o.extractedTexts.push({
    imageId: "second",
    role: "brand",
    text: "THERMOS",
    legibility: "clear",
  });
  assert.equal(photoHints(o, catalog.products).products.length, 0);
  const capacities = observe("KINTO", "500ml");
  capacities.extractedTexts.push({
    imageId: "second",
    role: "capacity",
    text: "950ml",
    legibility: "clear",
  });
  assert.equal(photoHints(capacities, catalog.products).products.length, 0);
  const uncertain = observe("KINTO", "500ml");
  uncertain.extractedTexts[0]!.legibility = "uncertain";
  assert.equal(photoHints(uncertain, catalog.products).products.length, 0);
  assert.equal(
    photoHints(observe("not KINTO", "500ml"), catalog.products).products.length,
    0,
  );
});
test("model comparison normalizes fullwidth characters while preserving OCR source", () => {
  const o = observe("THERMOS", "500ml");
  o.extractedTexts.push({
    imageId: "label",
    role: "model",
    text: "ＪＮＬ－５０５Ｋ",
    legibility: "clear",
  });
  const result = matchCatalogModels(o, catalog.products);
  assert.equal(normalizeModel("ＪＮＬ－５０５Ｋ"), "JNL505K");
  assert.deepEqual(
    result.candidates.map((p) => p.variantId),
    ["thermos-jnl-505k"],
  );
  assert.equal(result.comparisons[0]?.originalText, "ＪＮＬ－５０５Ｋ");
});
test("label preprocessing retains more detail without retaining EXIF or exceeding payload limits", async () => {
  const input = await sharp({
    create: { width: 3000, height: 2000, channels: 3, background: "white" },
  })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .toBuffer();
  const full = await normalizeImage(input, "full");
  const label = await normalizeImage(input, "label");
  const f = await sharp(full).metadata();
  const l = await sharp(label).metadata();
  assert.equal(Math.max(f.width!, f.height!), 1600);
  assert.equal(Math.max(l.width!, l.height!), 2400);
  assert.equal(l.orientation, undefined);
  assert.equal(l.exif, undefined);
  assert.ok(label.length <= 3_750_000);
  assert.equal(l.format, "jpeg");
});
test("purchase signals expire separately from compatibility and preserve historical stock", () => {
  const o = {
    ...catalog.offers[0]!,
    stock: "in_stock" as const,
    stockCheckedAt: "2026-09-20T03:00:00Z",
    market: "domestic" as const,
  };
  assert.equal(
    offerAvailability(o, new Date("2026-09-20T04:00:00Z")).stock,
    "in_stock",
  );
  assert.equal(
    offerAvailability(o, new Date("2026-09-21T04:00:00Z")).stock,
    "unknown",
  );
  assert.equal(
    offerAvailability(o, new Date("2026-09-19T04:00:00Z")).stock,
    "unknown",
  );
  assert.equal(o.stock, "in_stock");
  assert.equal(
    offerAvailability(
      { ...o, stock: "out_of_stock" },
      new Date("2026-09-21T04:00:00Z"),
    ).stock,
    "unknown",
  );
  assert.equal(
    offerAvailability(
      { ...o, stock: "unavailable" },
      new Date("2026-09-21T04:00:00Z"),
    ).stock,
    "unavailable",
  );
  const now = new Date("2026-09-20T04:00:00Z");
  assert.ok(
    offerPriority(o, now) < offerPriority({ ...o, stock: "unknown" }, now),
  );
  assert.ok(
    offerPriority({ ...o, stock: "unknown" }, now) <
      offerPriority({ ...o, stock: "out_of_stock" }, now),
  );
});
