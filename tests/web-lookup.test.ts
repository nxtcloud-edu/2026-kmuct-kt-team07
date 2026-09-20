import test from "node:test";
import assert from "node:assert/strict";
import {
  searchWeb,
  fetchPageText,
  lookupPartOnWeb,
} from "../server/web-lookup.js";

// Literal public addresses keep these tests off the network entirely: the
// address guard only resolves a name when the host is not already an IP.
const PAGE = "https://93.184.216.34/part";
const PAGE_2 = "https://93.184.216.35/shop";
const ddg = (...urls: string[]) =>
  urls
    .map(
      (u, i) =>
        `<a class="result__a" href="//duckduckgo.com/l/?uddg=${encodeURIComponent(u)}&amp;rut=x">결과 <b>${i + 1}</b></a>`,
    )
    .join("");

const reply = (body: string, type = "text/html") =>
  new Response(body, { status: 200, headers: { "content-type": type } });

test("search results come back with the redirect unwrapped", async () => {
  const fake = (async (url: string | URL) => {
    assert.match(String(url), /html\.duckduckgo\.com/u);
    return reply(ddg(PAGE, PAGE_2, PAGE));
  }) as unknown as typeof fetch;
  const found = await searchWeb("쿠쿠 공기청정기 필터", 5, fake);
  // The same address twice is one result, and the wrapper is gone.
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
  const fake = (async (url: string | URL) =>
    String(url).includes("duckduckgo")
      ? reply(ddg(PAGE, PAGE_2))
      : reply(
          `<p>쿠쿠 공기청정기 교체 필터 ACFS-X12M 입니다. ${"설명 ".repeat(100)}</p>`,
        )) as unknown as typeof fetch;
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
  // Only the page the model cited, and only links those pages actually carried.
  assert.deepEqual(
    part.sources.map((s) => s.url),
    [PAGE],
  );
  assert.deepEqual(
    part.purchases.map((b) => b.url),
    [PAGE],
  );
  assert.match(asked, /찾는 제품: 쿠쿠 공기청정기/u);
  assert.match(asked, /ACFS-X12M/u);
});

test("pages that cannot be read still hand over the links they found", async () => {
  const fake = (async (url: string | URL) =>
    String(url).includes("duckduckgo")
      ? reply(ddg(PAGE, PAGE_2))
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
});

test("an answer that is not JSON degrades to the pages themselves", async () => {
  const fake = (async (url: string | URL) =>
    String(url).includes("duckduckgo")
      ? reply(ddg(PAGE))
      : reply(`<p>${"내용 ".repeat(200)}</p>`)) as unknown as typeof fetch;
  const part = await lookupPartOnWeb(
    "제품",
    "필터",
    async () => "죄송하지만 찾지 못했습니다",
    { fetchImpl: fake },
  );
  assert.ok(part);
  assert.equal(part.partName, "");
  assert.deepEqual(
    part.sources.map((s) => s.url),
    [PAGE],
  );
});

test("nothing found at all is nothing, and an empty product never searches", async () => {
  const empty = (async () => reply("<html></html>")) as unknown as typeof fetch;
  assert.equal(
    await lookupPartOnWeb("제품", "필터", async () => "{}", {
      fetchImpl: empty,
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

test("every shop found is offered, so prices can be compared", async () => {
  const shops = [
    "https://www.coupang.com/vp/products/1",
    "https://www.gmarket.co.kr/n/search?keyword=x",
    "https://search.danawa.com/dsearch.php?query=x",
    "https://www.auction.co.kr/n/search?keyword=x",
  ];
  const fake = (async (url: string | URL) =>
    String(url).includes("duckduckgo")
      ? reply(
          ddg(...shops, PAGE).replace(
            "결과 5",
            '결과 5</a><a class="result__snippet">39,000원 무료배송</a><a class="x"',
          ),
        )
      : reply(`<p>교체 필터 ACFS-X12M ${"설명 ".repeat(100)}</p>`)) as unknown as typeof fetch;
  const part = await lookupPartOnWeb(
    "쿠쿠 공기청정기",
    "필터",
    async () =>
      '{"partName":"교체 필터","partNumber":"ACFS-X12M","compatibleModels":[],"note":"","sourceIndexes":[1],"purchases":[]}',
    { fetchImpl: fake },
  );
  assert.ok(part);
  // Four marketplaces, not one, and each is named for the user.
  assert.equal(part.purchases.length, 4);
  assert.deepEqual(
    part.purchases.map((b) => b.seller),
    ["쿠팡", "G마켓", "다나와", "옥션"],
  );
  // Marketplaces block readers, so they are listed and never fetched; the one
  // readable page is what the part details came from.
  assert.deepEqual(
    part.sources.map((s) => s.url),
    [PAGE],
  );
  assert.equal(part.partNumber, "ACFS-X12M");
});

test("shops are still offered when no page can be read", async () => {
  const fake = (async (url: string | URL) =>
    String(url).includes("duckduckgo")
      ? reply(ddg("https://www.coupang.com/vp/products/1", "https://11st.co.kr/p/2"))
      : new Response("", { status: 403 })) as unknown as typeof fetch;
  const part = await lookupPartOnWeb("제품", "필터", async () => "{}", {
    fetchImpl: fake,
  });
  assert.ok(part);
  assert.equal(part.partName, "");
  assert.deepEqual(
    part.purchases.map((b) => b.seller),
    ["쿠팡", "11번가"],
  );
});
