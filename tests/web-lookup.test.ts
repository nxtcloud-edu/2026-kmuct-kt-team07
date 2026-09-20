import test from "node:test";
import assert from "node:assert/strict";
import {
  searchWeb,
  fetchPageText,
  shopSearchLinks,
  lookupPartOnWeb,
} from "../server/web-lookup.js";

// Literal public addresses keep these tests off the network entirely: the
// address guard only resolves a name when the host is not already an IP.
const PAGE = "https://93.184.216.34/part";
const PAGE_2 = "https://93.184.216.35/shop";
/** A results page as the search engine returns it: plain outbound links. */
const results = (...urls: string[]) =>
  urls
    .map(
      (u, i) => `<a href="${u}" target="_blank"><span>결과 ${i + 1}</span></a>`,
    )
    .join("");

const reply = (body: string, type = "text/html") =>
  new Response(body, { status: 200, headers: { "content-type": type } });
const searchOnly = (html: string, page = `<p>${"내용 ".repeat(200)}</p>`) =>
  (async (url: string | URL) =>
    String(url).includes("search.naver.com")
      ? reply(html)
      : reply(page)) as unknown as typeof fetch;

test("results are the outbound links, and the site's own links are not", async () => {
  const fake = (async (url: string | URL) => {
    assert.match(String(url), /search\.naver\.com/u);
    return reply(
      results(
        PAGE,
        "https://www.naver.com/help",
        "https://youtube.com/watch?v=1",
        PAGE_2,
        PAGE,
      ),
    );
  }) as unknown as typeof fetch;
  const found = await searchWeb("쿠쿠 공기청정기 필터", 5, fake);
  // The engine's own pages, video links and the repeat are all gone.
  assert.deepEqual(
    found.map((f) => f.url),
    [PAGE, PAGE_2],
  );
  assert.equal(found[0]!.title, "결과 1");
});

test("a search that fails yields no results rather than throwing", async () => {
  const fake = (async () => {
    throw new Error("network");
  }) as unknown as typeof fetch;
  assert.deepEqual(await searchWeb("x", 3, fake), []);
});

test("shop links are built, not searched for, so they always exist", () => {
  const links = shopSearchLinks("ACFS-X12M 필터");
  assert.ok(links.length >= 6);
  assert.ok(links.every((l) => l.url.includes(encodeURIComponent("ACFS-X12M"))));
  assert.equal(new Set(links.map((l) => l.seller)).size, links.length);
  assert.ok(links.some((l) => l.seller === "다나와"));
  assert.ok(links.some((l) => l.seller === "쿠팡"));
  assert.deepEqual(shopSearchLinks("  "), []);
});

test("pages on private addresses are never fetched", async () => {
  let called = false;
  const fake = (async () => {
    called = true;
    return reply("<p>secret</p>");
  }) as unknown as typeof fetch;
  for (const url of [
    "https://127.0.0.1/admin",
    "https://10.0.0.5/",
    "https://169.254.169.254/latest/meta-data/",
    "file:///etc/passwd",
    "https://user:pw@93.184.216.34/",
  ])
    assert.equal(await fetchPageText(url, fake), "", url);
  assert.equal(called, false);
});

test("page text is stripped of markup and capped", async () => {
  const fake = (async () =>
    reply(
      `<html><script>ignored()</script><body><h1>필터</h1><p>부품번호 ACFS-X12M</p>${"긴 ".repeat(20000)}</body></html>`,
    )) as unknown as typeof fetch;
  const text = await fetchPageText(PAGE, fake);
  assert.ok(!text.includes("ignored"));
  assert.match(text, /부품번호 ACFS-X12M/u);
  assert.ok(text.length <= 12_000);
});

test("the part is read out of the fetched pages and keeps its sources", async () => {
  const fake = searchOnly(
    results(PAGE, PAGE_2),
    `<p>쿠쿠 공기청정기 교체 필터 ACFS-X12M 입니다. ${"설명 ".repeat(100)}</p>`,
  );
  let asked = "";
  const part = await lookupPartOnWeb(
    "쿠쿠 공기청정기",
    "필터",
    async (_system, user) => {
      asked = user;
      return `\`\`\`json
{"partName":"공기청정기 교체 필터","partNumber":"ACFS-X12M","compatibleModels":["AC-12"],"note":"","sourceIndexes":[1],"purchases":[{"seller":"쿠쿠몰","url":"${PAGE}"},{"seller":"지어냄","url":"https://8.8.8.8/made-up"}]}
\`\`\``;
    },
    { fetchImpl: fake },
  );
  assert.ok(part);
  assert.equal(part.partNumber, "ACFS-X12M");
  assert.deepEqual(part.compatibleModels, ["AC-12"]);
  assert.deepEqual(
    part.sources.map((s) => s.url),
    [PAGE],
  );
  // The page the model cited is kept; the address it invented is not.
  assert.ok(part.purchases.some((b) => b.url === PAGE));
  assert.ok(!part.purchases.some((b) => b.url.includes("made-up")));
  // Once the part number is known, the shop links search for that.
  assert.ok(
    part.purchases.some(
      (b) => b.seller === "다나와" && b.url.includes("ACFS-X12M"),
    ),
  );
  assert.match(asked, /찾는 제품: 쿠쿠 공기청정기/u);
  assert.match(asked, /ACFS-X12M/u);
});

test("a shop in the results is a place to buy, not a page to read", async () => {
  const fetched: string[] = [];
  const fake = (async (url: string | URL) => {
    const target = String(url);
    if (target.includes("search.naver.com"))
      return reply(
        results(
          "https://www.coupang.com/vp/products/1",
          "https://search.danawa.com/dsearch.php?query=x",
          PAGE,
        ),
      );
    fetched.push(target);
    return reply(`<p>교체 필터 ACFS-X12M ${"설명 ".repeat(100)}</p>`);
  }) as unknown as typeof fetch;
  const part = await lookupPartOnWeb(
    "쿠쿠 공기청정기",
    "필터",
    async () =>
      '{"partName":"교체 필터","partNumber":"ACFS-X12M","compatibleModels":[],"note":"","sourceIndexes":[1],"purchases":[]}',
    { fetchImpl: fake },
  );
  assert.ok(part);
  // Marketplaces block readers, so they are listed and never fetched.
  assert.deepEqual(fetched, [PAGE]);
  assert.deepEqual(
    part.sources.map((s) => s.url),
    [PAGE],
  );
  // The found listings come first, and no seller is offered twice.
  assert.equal(part.purchases[0]?.url, "https://www.coupang.com/vp/products/1");
  assert.equal(
    new Set(part.purchases.map((b) => b.seller)).size,
    part.purchases.length,
  );
  assert.ok(part.purchases.length >= 7);
});

test("nothing readable still ends with somewhere to buy it", async () => {
  const fake = (async (url: string | URL) =>
    String(url).includes("search.naver.com")
      ? reply(results(PAGE, PAGE_2))
      : new Response("", { status: 403 })) as unknown as typeof fetch;
  const part = await lookupPartOnWeb(
    "쿠쿠 공기청정기",
    "필터",
    async () => {
      throw new Error("모델을 부르면 안 됩니다");
    },
    { fetchImpl: fake },
  );
  assert.ok(part);
  assert.equal(part.partName, "");
  assert.match(part.note, /읽지 못했어요/u);
  assert.deepEqual(
    part.sources.map((s) => s.url),
    [PAGE, PAGE_2],
  );
  assert.ok(part.purchases.some((b) => b.seller === "쿠팡"));
});

test("an answer that is not JSON degrades to the pages themselves", async () => {
  const part = await lookupPartOnWeb(
    "제품",
    "필터",
    async () => "죄송하지만 찾지 못했습니다",
    { fetchImpl: searchOnly(results(PAGE)) },
  );
  assert.ok(part);
  assert.equal(part.partName, "");
  assert.deepEqual(
    part.sources.map((s) => s.url),
    [PAGE],
  );
  assert.ok(part.purchases.length > 0);
});

test("nothing found at all is nothing, and an empty product never searches", async () => {
  assert.equal(
    await lookupPartOnWeb("제품", "필터", async () => "{}", {
      fetchImpl: searchOnly("<html></html>"),
    }),
    null,
  );
  let touched = false;
  const spy = (async () => {
    touched = true;
    return reply("");
  }) as unknown as typeof fetch;
  assert.equal(
    await lookupPartOnWeb("   ", "필터", async () => "{}", { fetchImpl: spy }),
    null,
  );
  assert.equal(touched, false);
});
