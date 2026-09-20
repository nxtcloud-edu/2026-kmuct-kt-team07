import test from "node:test";
import assert from "node:assert/strict";
import { loadCatalog, catalogProducts } from "../server/catalog.js";
import { resolvePaths } from "../server/resolver.js";
import {
  filterProducts,
  interleaveProductGroups,
} from "../shared/catalog-search.js";
import {
  checks,
  groupCategories,
  categories,
  type Category,
} from "../shared/domain.js";
import { matchCatalogModels, hasIdentityConflict } from "../src/catalog.js";
import type { Observation } from "../src/observation.js";
import {
  offerLinkUsable,
  offerLinkNote,
  offerPriority,
} from "../shared/availability.js";
const catalog = loadCatalog();
const products = catalogProducts(catalog);
const observe = (
  model: string,
  brand?: string,
  capacity?: string,
): Observation => ({
  categoryCandidates: [],
  observedFeatures: [],
  qualityIssues: [],
  unknownFields: [],
  extractedTexts: [
    { text: model, role: "model", legibility: "clear", imageId: "label" },
    ...(brand
      ? [
          {
            text: brand,
            role: "brand" as const,
            legibility: "clear" as const,
            imageId: "label",
          },
        ]
      : []),
    ...(capacity
      ? [
          {
            text: capacity,
            role: "capacity" as const,
            legibility: "clear" as const,
            imageId: "label",
          },
        ]
      : []),
  ],
});
test("daily-life groups have attributed support and real detail-page offers, separately from stock", () => {
  for (const group of [
    "bicycle",
    "electronics",
    "furniture",
    "stationery",
    "cleaning",
    "plumbing",
    "kitchen",
    "personal_care",
    "tools",
    "outdoor",
    "pets",
    "travel",
    "clothing",
    "baby",
  ] as const) {
    const members = products.filter((p) => p.group === group);
    assert.ok(members.length, group);
    for (const p of members) {
      assert.ok(p.availableCategories.length, p.variantId);
      for (const category of p.availableCategories) {
        const cards = resolvePaths(catalog, p.variantId, category, "").cards;
        assert.ok(
          cards.some(
            (card) =>
              card.evidence.some(
                (e) =>
                  e.claim === "supports" &&
                  e.source.scope === "content_reviewed",
              ) && card.offers.length,
          ),
        );
        for (const card of cards)
          for (const offer of card.offers) {
            if (
              ["samsung-cfx-g100d", "lg-adq75133532"].includes(offer.partId)
            ) {
              assert.ok(offer.stockCheckedAt && offer.optionLabel);
            } else assert.equal(offer.stock, "unknown");
            assert.ok(!offer.source.url.includes("google.com/search"));
          }
      }
    }
  }
});
test("all categories have measurement prompts and cross-group filters stay isolated", () => {
  for (const key of Object.keys(categories) as Category[])
    assert.ok(checks[key].length);
  for (const options of Object.values(groupCategories))
    for (const key of options) assert.ok(categories[key]);
  assert.deepEqual(
    filterProducts(products, "다이슨 TP04", {
      group: "electronics",
      category: "remote",
      domesticOnly: true,
    }).map((p) => p.variantId),
    ["dyson-tp04"],
  );
  assert.equal(
    filterProducts(products, "다이슨 TP04", { group: "furniture" }).length,
    0,
  );
  assert.equal(
    filterProducts(products, "TP04", { category: "brush", domesticOnly: true })
      .length,
    0,
  );
  assert.ok(
    new Set(
      interleaveProductGroups(products)
        .slice(0, 10)
        .map((p) => p.group),
    ).size >= 9,
  );
});
test("same-family parts never leak across frame widths or remote models", () => {
  assert.deepEqual(
    resolvePaths(catalog, "ikea-billy-30522041", "shelf", "").cards.map(
      (c) => c.part.partId,
    ),
    ["ikea-shelf-50525270"],
  );
  assert.deepEqual(
    resolvePaths(catalog, "ikea-billy-00522047", "shelf", "").cards.map(
      (c) => c.part.partId,
    ),
    ["ikea-shelf-90525273"],
  );
  assert.equal(
    resolvePaths(catalog, "dyson-tp10", "remote", "").cards.length,
    0,
  );
  assert.ok(
    resolvePaths(catalog, "ikea-billy-30522041", "shelf", "").cards.every((c) =>
      c.evidence.some((e) => e.conditions.some((s) => s.includes("2014"))),
    ),
  );
});
test("model identity is exact; shared handle and family labels still ask for variant selection", () => {
  assert.deepEqual(
    matchCatalogModels(observe("BR-MT200"), catalog.products).candidates.map(
      (p) => p.variantId,
    ),
    ["shimano-br-mt200"],
  );
  assert.equal(
    matchCatalogModels(observe("BR-MT20"), catalog.products).candidates.length,
    0,
  );
  assert.equal(
    matchCatalogModels(observe("BILLY"), catalog.products).candidates.length,
    4,
  );
  assert.equal(
    matchCatalogModels(observe("HX684P"), catalog.products).candidates.length,
    2,
  );
  assert.ok(
    hasIdentityConflict(
      observe("TP04", "SHIMANO"),
      catalog.products.filter((p) => p.variantId === "dyson-tp04"),
    ),
  );
  assert.ok(
    !hasIdentityConflict(
      observe("TP04", "DYSON"),
      catalog.products.filter((p) => p.variantId === "dyson-tp04"),
    ),
  );
});
test("volume search never treats 50ml as 350ml or invents unknown capacities", () => {
  assert.equal(filterProducts(products, "50ml").length, 0);
  assert.deepEqual(
    filterProducts(products, "KINTO WATER BOTTLE 0.5 L").map(
      (p) => p.variantId,
    ),
    ["kinto-water-bottle-500"],
  );
  assert.ok(
    filterProducts(products, "500ml").every((p) => p.capacity === "500ml"),
  );
  assert.ok(
    hasIdentityConflict(
      observe("JNL-505K", "THERMOS", "350ml"),
      catalog.products.filter((p) => p.variantId === "thermos-jnl-505k"),
    ),
  );
});
test("unregistered objects keep their own context and supplied part details in search routes", () => {
  const paths = resolvePaths(
    catalog,
    null,
    "other",
    "가방 버클",
    { part: "버클", mount: "25mm 웨빙" },
    "clothing",
  );
  assert.equal(paths.cards.length, 0);
  assert.ok(
    paths.searches.every((s) => s.kind === "search_results" && !s.verified),
  );
  assert.ok(decodeURIComponent(paths.searches[1]!.url).includes("25mm 웨빙"));
  assert.ok(!paths.contactDraft.includes("물병"));
  assert.ok(paths.contactDraft.includes("버클"));
});

test("aftermarket bobbin claim and winder exception remain seller-attributed", () => {
  const card = resolvePaths(catalog, "singer-301", "bobbin", "").cards[0]!;
  assert.equal(card.part.origin, "aftermarket");
  assert.ok(card.evidence.every((e) => e.provider === "seller"));
  assert.ok(
    card.evidence.some((e) =>
      e.conditions.some((s) => s.includes("실감기 축")),
    ),
  );
  assert.equal(card.offers[0]!.market, "overseas");
  assert.equal(
    resolvePaths(catalog, "bugaboo-cameleon-3", "wheel", "").cards[0]!.part
      .partId,
    "bugaboo-cameleon-3-front",
  );
});

test("domestic appliance lists preserve full suffixes and never treat the filter code as an appliance", () => {
  const samsung = matchCatalogModels(
    observe("AX34A5310WWD", "SAMSUNG"),
    catalog.products,
  ).candidates;
  assert.equal(samsung.length, 1);
  assert.equal(
    resolvePaths(catalog, samsung[0]!.variantId, "filter", "").cards[0]!.part
      .partId,
    "samsung-cfx-g100d",
  );
  assert.equal(
    matchCatalogModels(observe("CFX-G100D"), catalog.products).candidates
      .length,
    0,
  );
  assert.equal(
    matchCatalogModels(observe("AX34A5310"), catalog.products).candidates
      .length,
    0,
  );
  assert.equal(
    matchCatalogModels(observe("FS061PGHA"), catalog.products).candidates
      .length,
    2,
  );
  const lg = matchCatalogModels(
    observe("FS061PGHA.AKORR", "LG"),
    catalog.products,
  ).candidates;
  assert.equal(lg.length, 1);
  assert.equal(lg[0]!.variantId, "lg-fs061pgha-akorr");
  assert.ok(!hasIdentityConflict(observe("FS061PGHA.AKORR", "LG"), lg));
});

test("BESTA combinations retain their listed shelf color and do not leak to BILLY", () => {
  assert.deepEqual(
    resolvePaths(catalog, "ikea-besta-89432897", "shelf", "").cards.map(
      (c) => c.part.partId,
    ),
    ["ikea-shelf-90352682"],
  );
  assert.deepEqual(
    resolvePaths(catalog, "ikea-besta-09598066", "hinge", "").cards.map(
      (c) => c.part.partId,
    ),
    ["ikea-hinge-60261259"],
  );
  assert.equal(
    resolvePaths(catalog, "ikea-billy-30522041", "hinge", "").cards.length,
    0,
  );
});

test("a broken purchase URL never changes compatibility or stock, but cannot advertise an available route", () => {
  const sample = catalog.offers.find((o) => o.partId === "samsung-cfx-g100d")!;
  const broken = {
    ...sample,
    linkCheck: {
      status: "broken" as const,
      checkedAt: new Date().toISOString(),
      httpStatus: 404,
    },
  };
  assert.equal(offerLinkUsable(broken), false);
  assert.equal(broken.stock, sample.stock);
  assert.match(offerLinkNote(broken), /품절이나 단종을 뜻하지/);
  assert.ok(offerPriority(broken) > offerPriority(sample));
  const modified = {
    ...catalog,
    offers: catalog.offers.map((o) =>
      o.offerId === sample.offerId ? broken : o,
    ),
  };
  const product = catalogProducts(modified).find(
    (p) => p.variantId === "samsung-ax34a5310wwd",
  )!;
  assert.ok(product.availableCategories.includes("filter"));
  assert.ok(!product.domesticCategories.includes("filter"));
  const blocked = {
    ...sample,
    linkCheck: {
      status: "blocked" as const,
      checkedAt: new Date().toISOString(),
      httpStatus: 403,
    },
  };
  assert.ok(offerLinkUsable(blocked));
});
