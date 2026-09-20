import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { createApp } from "../server/app.js";
import { Store } from "../server/store.js";
import { loadCatalog } from "../server/catalog.js";
import { normalizeImage } from "../server/images.js";
import type { AnalysisResult, ObservationRequest } from "../src/analysis.js";

const origin = "http://localhost:3001";
const fallback: AnalysisResult = {
  status: "needs_information",
  reason: "provider_error",
  attempts: 1,
  nextAction: { kind: "model_search", label: "모델명으로 찾기" },
};
async function fixture(
  analyze?: (r: ObservationRequest) => Promise<AnalysisResult>,
  dailyLimit = 100,
) {
  const store = new Store(":memory:");
  const service = createApp({
    store,
    catalog: loadCatalog(),
    analyze,
    origin,
    worker: false,
    dailyLimit,
  });
  const server = service.app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as { port: number };
  const base = `http://127.0.0.1:${address.port}`;
  async function session() {
    const r = await fetch(base + "/api/session");
    const b = await r.json();
    return {
      cookie: r.headers.get("set-cookie")!.split(";")[0]!,
      "x-csrf-token": b.csrf,
      origin,
    };
  }
  const headers = await session();
  async function request(
    path: string,
    body?: unknown,
    method = body === undefined ? "GET" : "POST",
    custom = headers,
  ) {
    return fetch(base + "/api" + path, {
      method,
      headers: {
        ...custom,
        ...(body && !(body instanceof FormData)
          ? { "content-type": "application/json" }
          : {}),
      },
      body:
        body === undefined
          ? undefined
          : body instanceof FormData
            ? body
            : JSON.stringify(body),
    });
  }
  return {
    store,
    service,
    base,
    headers,
    session,
    request,
    close: async () => {
      await service.stop();
      server.close();
      await once(server, "close");
      store.close();
    },
  };
}

test("server flow: model search → explicit variant → evidence, answers and private feedback", async () => {
  const f = await fixture();
  try {
    const created = await f.request("/requests", {
      query: "Nalgene Wide Mouth",
      category: "lid",
    });
    assert.equal(created.status, 201);
    const r = await created.json();
    assert.equal(r.candidates.length, 3);
    assert.equal(r.selectedVariantId, null);
    assert.equal(r.paths.cards.length, 0);
    assert.equal(r.owner, undefined);
    const selected = await (
      await f.request(`/requests/${r.id}/select`, {
        variantId: "nalgene-32",
        category: "lid",
      })
    ).json();
    assert.equal(
      selected.paths.cards.find(
        (c: { part: { partId: string } }) => c.part.partId === "nalgene-cap",
      ).status,
      "source_supported",
    );
    const answer = await f.request(`/requests/${r.id}/answers`, {
      opening: "63 mm",
    });
    assert.equal(answer.status, 200);
    assert.equal(
      (await f.request(`/requests/${r.id}/answers`, { unexpected: "oops" }))
        .status,
      400,
    );
    const feedback = await f.request(`/requests/${r.id}/feedback`, {
      partId: "nalgene-cap",
      outcome: "not_tested",
      conditions: "사진 시연만 진행, 장착 전",
      testedAt: "2026-09-20",
    });
    assert.equal(feedback.status, 201);
    const stored = await (await f.request(`/requests/${r.id}`)).json();
    assert.equal(stored.feedback[0].verification, "user_report_unverified");
    assert.equal(
      (
        await f.request(`/requests/${r.id}/select`, {
          variantId: "invented",
          category: "lid",
        })
      ).status,
      400,
    );
    await f.request(`/requests/${r.id}/select`, {
      variantId: "nalgene-16",
      category: "lid",
    });
    assert.deepEqual(
      (await (await f.request(`/requests/${r.id}`)).json()).answers,
      {},
    );
    assert.equal(
      (await f.request(`/requests/${r.id}`, undefined, "DELETE")).status,
      204,
    );
    assert.equal((await f.request(`/requests/${r.id}`)).status, 404);
  } finally {
    await f.close();
  }
});
test("session ownership, CSRF and unknown session cannot expose or mutate records", async () => {
  const f = await fixture();
  try {
    const r = await (
      await f.request("/requests", { query: "private model", category: "lid" })
    ).json();
    const other = await f.session();
    assert.equal(
      (await f.request(`/requests/${r.id}`, undefined, "GET", other)).status,
      404,
    );
    assert.equal(
      (
        await f.request("/requests", { query: "X" }, "POST", {
          ...f.headers,
          origin: "https://evil.example",
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await f.request("/requests", { query: "X" }, "POST", {
          ...f.headers,
          "x-csrf-token": "wrong",
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await fetch(f.base + "/api/requests", {
          headers: { cookie: "parts_session=unknown" },
        })
      ).status,
      401,
    );
    await f.request(`/requests/${r.id}`, undefined, "DELETE", other);
    assert.equal((await f.request(`/requests/${r.id}`)).status, 200);
    const history = await f.request("/requests");
    assert.equal(history.headers.get("cache-control"), "no-store");
    assert.equal(history.headers.get("x-content-type-options"), "nosniff");
  } finally {
    await f.close();
  }
});
test("real multipart decodes, strips metadata and retains image roles; output has no photos", async () => {
  let sent: ObservationRequest | undefined;
  const f = await fixture(async (r) => {
    sent = r;
    return fallback;
  });
  try {
    const photo = await sharp({
      create: { width: 60, height: 40, channels: 3, background: "#00aa55" },
    })
      .jpeg()
      .withMetadata()
      .toBuffer();
    const data = new FormData();
    data.set("category", "lid");
    data.set("roles", '["label"]');
    data.append(
      "images",
      new Blob([new Uint8Array(photo)], { type: "image/jpeg" }),
      "product.jpg",
    );
    const created = await f.request("/requests", data);
    assert.equal(created.status, 201);
    const r = await created.json();
    await f.service.stop();
    assert.equal(sent?.images[0]!.role, "label");
    const meta = await sharp(sent!.images[0]!.bytes).metadata();
    assert.equal(meta.exif, undefined);
    const stored = await (await f.request(`/requests/${r.id}`)).json();
    assert.equal(stored.state, "ready");
    assert.equal(stored.payload, undefined);
    assert.equal(
      f.store.db.prepare("SELECT payload FROM requests WHERE id=?").get(r.id)!
        .payload,
      null,
    );
  } finally {
    await f.close();
  }
});
test("invalid images never invoke AI, large pixel images and wrong format are rejected", async () => {
  let count = 0;
  const f = await fixture(async () => {
    count++;
    return fallback;
  });
  try {
    const data = new FormData();
    data.set("category", "lid");
    data.set("roles", '["full"]');
    data.append(
      "images",
      new Blob(["not an image"], { type: "image/jpeg" }),
      "fake.jpg",
    );
    assert.equal((await f.request("/requests", data)).status, 400);
    assert.equal(count, 0);
    await assert.rejects(
      normalizeImage(
        Buffer.from(
          '<svg xmlns="http://www.w3.org/2000/svg" width="5" height="5"/>',
        ),
      ),
    );
    const huge = await sharp({
      create: { width: 5001, height: 5000, channels: 3, background: "#ffffff" },
    })
      .png()
      .toBuffer();
    await assert.rejects(normalizeImage(huge));
  } finally {
    await f.close();
  }
});
test("daily AI limit is global across fresh sessions; model search remains available", async () => {
  let count = 0;
  const f = await fixture(async () => {
    count++;
    return fallback;
  }, 1);
  try {
    assert.equal(
      (await f.request("/requests", { demo: true, category: "lid" })).status,
      201,
    );
    await f.service.stop();
    const second = await f.session();
    assert.equal(
      (
        await f.request(
          "/requests",
          { demo: true, category: "lid" },
          "POST",
          second,
        )
      ).status,
      429,
    );
    assert.equal(
      (
        await f.request(
          "/requests",
          { query: "Nalgene", category: "lid" },
          "POST",
          second,
        )
      ).status,
      201,
    );
    assert.equal(count, 1);
  } finally {
    await f.close();
  }
});
test("deleting in-flight work cannot resurrect a private record", async () => {
  let resolve!: (value: AnalysisResult) => void;
  const waiting = new Promise<AnalysisResult>((r) => {
    resolve = r;
  });
  const f = await fixture(async () => waiting);
  try {
    const r = await (
      await f.request("/requests", { demo: true, category: "lid" })
    ).json();
    await f.request(`/requests/${r.id}`, undefined, "DELETE");
    resolve(fallback);
    await f.service.stop();
    assert.equal((await f.request(`/requests/${r.id}`)).status, 404);
  } finally {
    resolve(fallback);
    await f.close();
  }
});
test("durable restart restores queued work but never repeats an interrupted billable call", async () => {
  const dir = await mkdtemp(join(tmpdir(), "parts-store-"));
  try {
    const path = join(dir, "db.sqlite");
    let store = new Store(path);
    const session = store.newSession();
    const payload: ObservationRequest = {
      allowedCategoryKeys: ["lid"],
      images: [
        {
          imageId: "a",
          role: "full",
          format: "jpeg",
          bytes: await readFile("tests/fixtures/public-water-bottle.jpg"),
        },
      ],
    };
    const interrupted = store.create(session.id, "", "lid", payload);
    store.next();
    const queued = store.create(session.id, "", "lid", payload);
    store.close();
    store = new Store(path);
    assert.equal(store.get(interrupted.id)?.state, "ready");
    assert.equal(
      store.get(interrupted.id)?.analysis?.status,
      "needs_information",
    );
    assert.equal(store.get(queued.id)?.state, "queued");
    assert.equal(store.next()?.record.id, queued.id);
    store.db.prepare("UPDATE requests SET created=?").run(0);
    store.cleanup();
    assert.equal(store.get(queued.id), undefined);
    store.close();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("idempotent create reuses results, rejects changed input and never resurrects deleted requests", async () => {
  let calls = 0;
  const f = await fixture(async () => {
    calls++;
    return fallback;
  });
  try {
    const headers = {
      ...f.headers,
      "idempotency-key": "f117db37-ef51-4d7f-9635-51c3462685a1",
    };
    const first = await (
      await f.request(
        "/requests",
        { demo: true, category: "lid" },
        "POST",
        headers,
      )
    ).json();
    await f.service.stop();
    const second = await f.request(
      "/requests",
      { demo: true, category: "lid" },
      "POST",
      headers,
    );
    assert.equal(second.status, 200);
    assert.equal((await second.json()).id, first.id);
    assert.equal(calls, 1);
    assert.equal(
      (
        await f.request(
          "/requests",
          { demo: true, category: "gasket" },
          "POST",
          headers,
        )
      ).status,
      409,
    );
    await f.request(`/requests/${first.id}`, undefined, "DELETE");
    assert.equal(
      (
        await f.request(
          "/requests",
          { demo: true, category: "lid" },
          "POST",
          headers,
        )
      ).status,
      410,
    );
    assert.equal(calls, 1);
  } finally {
    await f.close();
  }
});
test("stale browser mutations are rejected and repeated feedback stays one private report", async () => {
  const f = await fixture();
  try {
    const r = await (
      await f.request("/requests", { query: "Nalgene", category: "lid" })
    ).json();
    const headers = { ...f.headers, "if-match": String(r.revision) };
    const updated = await f.request(
      `/requests/${r.id}/select`,
      { variantId: "nalgene-32", category: "lid" },
      "POST",
      headers,
    );
    assert.equal(updated.status, 200);
    assert.equal(
      (
        await f.request(
          `/requests/${r.id}/select`,
          { variantId: "nalgene-16", category: "lid" },
          "POST",
          headers,
        )
      ).status,
      409,
    );
    const report = {
      partId: "nalgene-cap",
      outcome: "not_tested",
      conditions: "실물 장착 전",
      testedAt: "2026-09-20",
    };
    await f.request(`/requests/${r.id}/feedback`, report);
    await f.request(`/requests/${r.id}/feedback`, report);
    assert.equal(
      (await (await f.request(`/requests/${r.id}`)).json()).feedback.length,
      1,
    );
  } finally {
    await f.close();
  }
});

test("expanded catalog API filters domestic parts and routes exact Thermos model to a genuine offer", async () => {
  const f = await fixture();
  try {
    const listing = await (
      await f.request(
        "/catalog?q=FHL&category=straw&domestic=true&capacity=550ml",
      )
    ).json();
    assert.deepEqual(
      listing.products.map((p: { variantId: string }) => p.variantId),
      ["thermos-fhl-550k"],
    );
    const created = await (
      await f.request("/requests", { query: "jnl 505k", category: "gasket" })
    ).json();
    assert.equal(created.candidates[0].variantId, "thermos-jnl-505k");
    assert.equal(created.selectedVariantId, null);
    const selected = await (
      await f.request(`/requests/${created.id}/select`, {
        variantId: "thermos-jnl-505k",
        category: "gasket",
      })
    ).json();
    assert.equal(selected.paths.cards[0].part.partId, "thermos-jnl-gasket");
    assert.equal(selected.paths.cards[0].offers[0].market, "domestic");
    assert.equal(selected.paths.cards[0].offers[0].stock, "unknown");
  } finally {
    await f.close();
  }
});

test("photo brand-capacity hints remain separate from identification through the HTTP flow", async () => {
  const f = await fixture(async () => ({
    status: "needs_information",
    reason: "model_not_found",
    attempts: 1,
    nextAction: { kind: "model_search", label: "모델명으로 찾기" },
    modelComparisons: [],
    candidateVariantIds: [],
    observation: {
      categoryCandidates: [],
      observedFeatures: [],
      qualityIssues: ["label_missing"],
      unknownFields: ["model"],
      extractedTexts: [
        {
          imageId: "image-1",
          role: "brand",
          text: "KINTO",
          legibility: "clear",
        },
        {
          imageId: "image-1",
          role: "capacity",
          text: "0.5 L",
          legibility: "clear",
        },
      ],
    },
  }));
  try {
    const image = await sharp({
      create: { width: 100, height: 100, channels: 3, background: "white" },
    })
      .jpeg()
      .toBuffer();
    const body = new FormData();
    body.set("category", "gasket");
    body.set("roles", '["label"]');
    body.append(
      "images",
      new Blob([new Uint8Array(image)], { type: "image/jpeg" }),
      "label.jpg",
    );
    const created = await (await f.request("/requests", body)).json();
    await f.service.stop();
    const r = await (await f.request(`/requests/${created.id}`)).json();
    assert.equal(r.selectedVariantId, null);
    assert.equal(r.candidates.length, 0);
    assert.deepEqual(
      r.photoHints.products.map((p: { variantId: string }) => p.variantId),
      ["kinto-water-bottle-500"],
    );
    assert.equal(r.paths.cards.length, 0);
    const selected = await (
      await f.request(`/requests/${r.id}/select`, {
        variantId: "kinto-water-bottle-500",
        category: "gasket",
      })
    ).json();
    assert.equal(selected.selectedVariantId, "kinto-water-bottle-500");
    const offer = selected.paths.cards.find(
      (c: { part: { partId: string } }) => c.part.partId === "kinto-80380",
    ).offers[0];
    assert.ok(offer.availability.checkedAt);
    assert.ok(["in_stock", "unknown"].includes(offer.availability.stock));
  } finally {
    await f.close();
  }
});

test("daily-life request group survives HTTP flow and separates category-specific purchase paths", async () => {
  const f = await fixture();
  try {
    const response = await f.request("/requests", {
      query: "TP04",
      group: "electronics",
      category: "remote",
    });
    assert.equal(response.status, 201);
    const created = await response.json();
    assert.equal(created.group, "electronics");
    assert.equal(created.candidates[0].variantId, "dyson-tp04");
    const selected = await (
      await f.request(`/requests/${created.id}/select`, {
        variantId: "dyson-tp04",
        category: "remote",
      })
    ).json();
    assert.equal(selected.paths.cards[0].part.partId, "dyson-969154-02");
    const listed = await (
      await f.request("/catalog?group=furniture&category=shelf&domestic=true")
    ).json();
    assert.equal(listed.products.length, 4);
    assert.ok(
      listed.products.every((p: { group: string }) => p.group === "furniture"),
    );
    const unknown = await (
      await f.request("/requests", {
        query: "가방 버클",
        group: "clothing",
        category: "other",
      })
    ).json();
    assert.equal(unknown.paths.cards.length, 0);
    assert.ok(!unknown.paths.contactDraft.includes("물병"));
  } finally {
    await f.close();
  }
});
