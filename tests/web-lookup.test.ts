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
/**
 * A results page as the search engine returns it: plain outbound links. A
 * listing's own title decides whether it is offered as a place to buy, so an
 * entry may carry one; the rest get a placeholder.
 */
const results = (...urls: (string | [string, string])[]) =>
  urls
    .map((entry, i) => {
      const [u, title] = Array.isArray(entry)
        ? entry
        : [entry, `결과 ${i + 1}`];
      return `<a href="${u}" target="_blank"><span>${title}</span></a>`;
    })
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
  assert.ok(
    links.every((l) => l.url.includes(encodeURIComponent("ACFS-X12M"))),
  );
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
          [
            "https://www.coupang.com/vp/products/1",
            "쿠쿠 공기청정기 교체 필터",
          ],
          [
            "https://search.danawa.com/dsearch.php?query=x",
            "쿠쿠 공기청정기 필터 최저가",
          ],
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

test("the part's words scattered through a title are a different product", async () => {
  const fake = (async (url: string | URL) =>
    String(url).includes("search.naver.com")
      ? reply(
          results(
            // A caliper that ships with pads: every word of the part is here,
            // but it is not what is being sold.
            [
              "https://www.coupang.com/vp/products/1",
              "디스크캘리퍼 시마노 BR MT200 유압 디스크 브레이크 캘리퍼스 B0S 수지 패드 자전거",
            ],
          ),
        )
      : new Response("", { status: 403 })) as unknown as typeof fetch;
  const part = await lookupPartOnWeb(
    "시마노 BR-MT200",
    "브레이크 패드",
    async () => "",
    { fetchImpl: fake },
  );
  assert.ok(part);
  assert.ok(!part.purchases.some((b) => b.url.includes("/vp/products/1")));
  assert.ok(
    part.purchases
      .find((b) => b.seller === "쿠팡")
      ?.url.includes("coupang.com/np/search"),
  );
});

test("a label that offers alternatives is matched by any one of them", async () => {
  const fake = (async (url: string | URL) =>
    String(url).includes("search.naver.com")
      ? reply(
          results([
            "https://www.coupang.com/vp/products/1",
            "물걸레 청소기 전용 청소패드 6개입",
          ]),
        )
      : new Response("", { status: 403 })) as unknown as typeof fetch;
  // The taxonomy writes this category as "교체 걸레·청소패드".
  const part = await lookupPartOnWeb(
    "물걸레 청소기",
    "교체 걸레·청소패드",
    async () => "",
    { fetchImpl: fake },
  );
  assert.ok(part);
  assert.ok(part.purchases.some((b) => b.url.includes("/vp/products/1")));
});

test("a label that only says 부품 judges no listing", async () => {
  const fake = (async (url: string | URL) =>
    String(url).includes("search.naver.com")
      ? reply(
          results([
            "https://www.coupang.com/vp/products/1",
            "어떤 제품의 이름 모를 조각",
          ]),
        )
      : new Response("", { status: 403 })) as unknown as typeof fetch;
  // app.ts sends this when the category is "other"; it says nothing to match on.
  const part = await lookupPartOnWeb("제품", "교체 부품", async () => "", {
    fetchImpl: fake,
  });
  assert.ok(part);
  assert.ok(part.purchases.some((b) => b.url.includes("/vp/products/1")));
});

test("a listing for a different part gives its slot to the shop's search", async () => {
  const fake = (async (url: string | URL) =>
    String(url).includes("search.naver.com")
      ? reply(
          results(
            // The whole brake, not its pads: searching for a part returns the
            // product it belongs to just as often.
            [
              "https://www.coupang.com/vp/products/1",
              "시마노 알투스 유압식 디스크 브레이크 BR-MT200",
            ],
            // The pads, written without the space listings often drop.
            [
              "https://www.11st.co.kr/products/2",
              "시마노 B01S 레진 브레이크패드",
            ],
            // A second listing from a shop already offered.
            [
              "https://www.11st.co.kr/products/3",
              "시마노 B01S 브레이크 패드 2팩",
            ],
          ),
        )
      : new Response("", { status: 403 })) as unknown as typeof fetch;
  const part = await lookupPartOnWeb(
    "시마노 BR-MT200",
    "브레이크 패드",
    async () => "",
    { fetchImpl: fake },
  );
  assert.ok(part);
  // The caliper is gone, and 쿠팡 is still offered — as a search that lands on
  // the pads rather than on the wrong product.
  assert.ok(!part.purchases.some((b) => b.url.includes("/vp/products/1")));
  const coupang = part.purchases.find((b) => b.seller === "쿠팡");
  assert.ok(coupang?.url.includes("coupang.com/np/search"));
  // The pads are kept, spacing and all, and the shop is offered only once.
  assert.ok(part.purchases.some((b) => b.url.includes("/products/2")));
  assert.ok(!part.purchases.some((b) => b.url.includes("/products/3")));
  assert.equal(
    new Set(part.purchases.map((b) => b.seller)).size,
    part.purchases.length,
  );
});

test("a link's name drops the reader-only suffix the engine adds", async () => {
  const fake = (async () =>
    reply(
      `<a href="https://www.coupang.com/vp/products/9"><span>시마노 브레이크 패드 B01S 새 창 열림</span></a>`,
    )) as unknown as typeof fetch;
  const [found] = await searchWeb("시마노 브레이크 패드", 1, fake);
  assert.equal(found?.title, "시마노 브레이크 패드 B01S");
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
