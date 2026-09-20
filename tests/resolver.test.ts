import test from "node:test";
import assert from "node:assert/strict";
import { loadCatalog } from "../server/catalog.js";
import { resolvePaths, reviewEvidence } from "../server/resolver.js";
import { catalogSchema, type Evidence } from "../shared/domain.js";

const catalog = loadCatalog();
const today = new Date("2026-09-20T12:00:00Z");
test("curated catalog has referential integrity and separate stock and compatibility", () => {
  assert.equal(catalogSchema.safeParse(catalog).success, true);
  const result = resolvePaths(catalog, "nalgene-32", "lid", "");
  const cap = result.cards.find((c) => c.part.partId === "nalgene-cap")!;
  assert.equal(cap.status, "source_supported");
  assert.equal(cap.offers[0]!.stock, "unknown");
  assert.equal(
    result.cards.find((c) => c.part.partId === "nalgene-small-cap")!.status,
    "excluded",
  );
});
test("aftermarket evidence retains its author and conditions, legacy is excluded", () => {
  const result = resolvePaths(catalog, "hydro-32", "lid", "");
  const candidate = result.cards.find((c) => c.part.partId === "capcap-plus")!;
  assert.equal(candidate.status, "check_required");
  assert.equal(candidate.evidence[0]!.provider, "part_manufacturer");
  const legacy = result.cards.find((c) => c.part.partId === "capcap-legacy")!;
  assert.equal(legacy.status, "excluded");
  assert.equal(legacy.part.lifecycle, "discontinued");
  assert.equal(legacy.offers[0]!.stock, "unavailable");
});
test("a conflicting claim cannot be outvoted by positive reports, stock never affects review", () => {
  const e = catalog.evidence[0]!;
  const negative: Evidence = {
    ...e,
    evidenceId: "excluded",
    claim: "excludes",
    provider: "seller",
  };
  const result = reviewEvidence([e, e, e, negative], today);
  assert.equal(result.status, "conflict");
});
test("stale or link-only source does not imply current confirmed applicability", () => {
  const e = catalog.evidence[0]!;
  assert.equal(
    reviewEvidence(
      [{ ...e, source: { ...e.source, checkedAt: "2020-01-01" } }],
      today,
    ).status,
    "check_required",
  );
  assert.equal(
    reviewEvidence(
      [{ ...e, source: { ...e.source, scope: "link_only" } }],
      today,
    ).status,
    "check_required",
  );
});
test("unknown model and category retain usable, honestly labelled search paths", () => {
  const result = resolvePaths(catalog, null, "gasket", "모델 X", {
    inner: "10 mm",
  });
  assert.equal(result.product, null);
  assert.equal(result.cards.length, 0);
  assert.equal(result.searches.length, 4);
  assert.ok(
    result.searches.every((s) => s.kind === "search_results" && !s.verified),
  );
  assert.match(result.searches[1]!.url, /10%20mm/);
  assert.match(result.contactDraft, /10 mm/);
});
test("changing user measurements cannot turn generic or missing evidence into compatibility", () => {
  const result = resolvePaths(catalog, "hydro-32", "gasket", "", {
    inner: "63mm",
  });
  assert.equal(result.cards.length, 0);
  assert.equal(result.checks[0]!.answer, "63mm");
});
test("catalog rejects dangling references, duplicate IDs and unsupported discontinuation", () => {
  assert.equal(
    catalogSchema.safeParse({
      ...catalog,
      offers: [{ ...catalog.offers[0], partId: "missing" }],
    }).success,
    false,
  );
  assert.equal(
    catalogSchema.safeParse({
      ...catalog,
      products: [...catalog.products, catalog.products[0]],
    }).success,
    false,
  );
  assert.equal(
    catalogSchema.safeParse({
      ...catalog,
      parts: [{ ...catalog.parts[0], lifecycle: "discontinued" }],
    }).success,
    false,
  );
  assert.equal(
    catalogSchema.safeParse({
      ...catalog,
      products: [
        {
          ...catalog.products[0],
          source: {
            ...catalog.products[0]!.source,
            url: "javascript:alert(1)",
          },
        },
      ],
    }).success,
    false,
  );
});
