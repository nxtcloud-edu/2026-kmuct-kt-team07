import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Finding a part for a product the catalog does not carry. The catalog only
 * holds 470 products with reviewed evidence; the thing in someone's photo
 * usually is not one of them, and saying "등록된 제품이 아니에요" is not an
 * answer. So the identified product is searched for on the web, a few pages
 * are read, and the observer pulls the part out of what those pages actually
 * say — with the source next to every claim, because nothing here is reviewed.
 */

export type WebSource = { title: string; url: string; snippet?: string };
/** One place selling the part. Several are returned so prices can be compared. */
export type WebShop = {
  seller: string;
  title: string;
  url: string;
  /** The search snippet, which usually carries the price. Never our own guess. */
  snippet: string;
};
export type WebPart = {
  partName: string;
  partNumber: string;
  compatibleModels: string[];
  note: string;
  sources: WebSource[];
  purchases: WebShop[];
};

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

/** Pages we fetch are chosen by a search engine, so the address is untrusted. */
async function isPublicUrl(raw: string) {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;
  if (url.username || url.password) return false;
  const host = url.hostname.replace(/^\[|\]$/gu, "");
  const addresses = isIP(host)
    ? [{ address: host }]
    : await lookup(host, { all: true }).catch(() => []);
  if (!addresses.length) return false;
  return addresses.every(({ address }) => {
    if (isIP(address) === 6)
      return !/^(::1?$|fc|fd|fe80)/iu.test(address) && address !== "::";
    const [a, b] = address.split(".").map(Number) as [number, number];
    return !(
      a === 10 ||
      a === 127 ||
      a === 0 ||
      a === 169 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127)
    );
  });
}

const decode = (text: string) =>
  text
    .replace(/&amp;/gu, "&")
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">")
    .replace(/&quot;/gu, '"')
    .replace(/&#x27;|&#39;/gu, "'")
    .replace(/&nbsp;/gu, " ");

const strip = (html: string) =>
  decode(
    html
      .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/giu, " ")
      .replace(/<[^>]+>/gu, " "),
  )
    .replace(/\s+/gu, " ")
    .trim();

// Searches queue with a gap between them: a search engine that sees a burst
// from one address answers with an empty page.
let searchTurn: Promise<unknown> = Promise.resolve();
const GAP_MS = 700;
// Not unref'd: the process must stay awake for a search that is only waiting.
const wait = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

// Naver, not DuckDuckGo. DuckDuckGo answers a datacenter address with an empty
// page — verified from the deployed host — so it never worked in production,
// and these are Korean household products besides.
const NAVER = "https://search.naver.com/search.naver?query=";
const internal =
  /(^|\.)(naver\.(com|net)|pstatic\.net|navercorp\.com|youtube\.com|youtu\.be|facebook\.com|instagram\.com|twitter\.com)$/iu;

/** Search results, as a list of addresses worth reading. */
export async function searchWeb(
  query: string,
  limit = 5,
  fetchImpl: typeof fetch = fetch,
): Promise<WebSource[]> {
  const mine = searchTurn.then(() => wait(GAP_MS));
  searchTurn = mine;
  await mine;
  const response = await fetchImpl(NAVER + encodeURIComponent(query), {
    headers: { "user-agent": UA, "accept-language": "ko-KR,ko;q=0.9" },
    signal: AbortSignal.timeout(12_000),
  }).catch(() => null);
  if (!response?.ok) return [];
  const html = await response.text();
  const results: WebSource[] = [];
  // Naver's class names are hashed and change without notice, so results are
  // taken as plain outbound links: the address is the part that stays stable.
  for (const match of html.matchAll(
    /<a\b[^>]*href="(https?:\/\/[^"]+)"[^>]*>([\s\S]{0,400}?)<\/a>/giu,
  )) {
    const url = decode(match[1]!);
    let host: string;
    try {
      host = new URL(url).hostname.replace(/^www\./iu, "");
    } catch {
      continue;
    }
    if (internal.test(host)) continue;
    if (results.some((r) => r.url === url)) continue;
    // Naver appends "새 창 열림" to every outbound link for screen readers;
    // it is not part of the listing's name and was being shown as one.
    const title = strip(match[2] ?? "")
      .replace(/\s*새\s*창\s*열림\s*$/u, "")
      .slice(0, 80);
    results.push({ title: title || host, url, snippet: "" });
    if (results.length >= limit) break;
  }
  return results;
}

/**
 * Where to buy something, built rather than searched for. Every marketplace has
 * a search address of a known shape, so these links always exist, cost no
 * request, and land on a list of offers with prices — which is what comparing
 * prices needs. The shops themselves refuse readers, so asking them is not an
 * option anyway.
 */
export function shopSearchLinks(query: string): WebShop[] {
  const q = encodeURIComponent(query.trim());
  if (!q) return [];
  return [
    ["네이버쇼핑", `https://search.shopping.naver.com/search/all?query=${q}`],
    ["다나와", `https://search.danawa.com/dsearch.php?query=${q}`],
    ["쿠팡", `https://www.coupang.com/np/search?q=${q}`],
    ["11번가", `https://search.11st.co.kr/pc/total-search?kwd=${q}`],
    ["G마켓", `https://www.gmarket.co.kr/n/search?keyword=${q}`],
    ["옥션", `https://browse.auction.co.kr/search?keyword=${q}`],
    ["에누리", `https://price.enuri.com/search?keyword=${q}`],
  ].map(([seller, url]) => ({
    seller: seller!,
    title: `${query.trim()} 검색 결과`,
    url: url!,
    snippet: "",
  }));
}

/** Hosts that sell things: their listings are shops, not pages to read. */
const sellerNames: [RegExp, string][] = [
  [/coupang\./iu, "쿠팡"],
  [/gmarket\.|g9\./iu, "G마켓"],
  [/11st\./iu, "11번가"],
  [/auction\./iu, "옥션"],
  [/(^|\.)ssg\./iu, "SSG"],
  [/smartstore\.naver\.|shopping\.naver\./iu, "네이버쇼핑"],
  [/danawa\./iu, "다나와"],
  [/enuri\./iu, "에누리"],
  [/interpark\./iu, "인터파크"],
  [/lotteon\./iu, "롯데온"],
  [/himart\./iu, "하이마트"],
  [/tmon\./iu, "티몬"],
  [/wemakeprice\./iu, "위메프"],
  [/aliexpress\./iu, "알리익스프레스"],
  [/amazon\./iu, "아마존"],
  [/ebay\./iu, "이베이"],
  [/shoppinghow\.kakao\./iu, "카카오쇼핑하우"],
];

/** True for the marketplaces above: their listings are shops, not sources. */
const knownSeller = (url: string) => {
  try {
    const host = new URL(url).hostname;
    return sellerNames.some(([pattern]) => pattern.test(host));
  } catch {
    return false;
  }
};
const sellerOf = (url: string) => {
  let host: string;
  try {
    host = new URL(url).hostname.replace(/^www\./iu, "");
  } catch {
    return "";
  }
  return sellerNames.find(([pattern]) => pattern.test(host))?.[1] ?? host;
};

/**
/** Spacing and punctuation vary listing to listing; the letters do not. */
const flatten = (text: string) =>
  text.toLowerCase().replace(/[^0-9a-z가-힣]/gu, "");

/** A label that says nothing about a listing: everything sold here is a 부품. */
const genericLabel = /^(교체)?부품$/u;

/**
 * The part label as the phrases a listing could name it by. A label may offer
 * alternatives — "브러시·청소툴", "면도망·면도날" — and any one of them is the
 * part.
 */
const partPhrases = (partLabel: string) =>
  partLabel
    .split(/[·/,]/u)
    .map(flatten)
    .filter((phrase) => phrase.length >= 2 && !genericLabel.test(phrase));

/**
 * How well a marketplace listing answers the part we were asked for, judged by
 * its own title. 0 is not the part and is never offered.
 *
 * 2 — the part is named as a phrase: 브레이크패드, 청소패드.
 * 1 — only the thing itself is named: 패드. Marketplace titles are often run
 *     through a translator and come out as word salad — "브레이크 유압 오른쪽
 *     MTB 피스톤 패드 왼쪽 디스크" is a real listing for real pads — so a
 *     scattered title is kept rather than dropped.
 *
 * The rank, not a pass mark, is what keeps the wrong thing out: a caliper that
 * ships with pads scores 1, and the shop's slot goes to whichever of its
 * listings scores highest.
 */
const listingRank = (title: string, partLabel: string) => {
  const phrases = partPhrases(partLabel);
  if (!phrases.length) return 1;
  const flat = flatten(title);
  if (phrases.some((phrase) => flat.includes(phrase))) return 2;
  // Korean names a thing last: 브레이크 "패드", 교체 "지우개".
  const heads = partLabel
    .split(/[·/,]/u)
    .map((alt) => flatten(alt.split(/\s+/u).at(-1) ?? ""))
    .filter((head) => head.length >= 2 && !genericLabel.test(head));
  return heads.some((head) => flat.includes(head)) ? 1 : 0;
};

/** Reads one page, capped: a search result may be any size at all. */
export async function fetchPageText(
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  if (!(await isPublicUrl(url))) return "";
  const response = await fetchImpl(url, {
    headers: { "user-agent": UA, accept: "text/html,*/*" },
    redirect: "follow",
    signal: AbortSignal.timeout(12_000),
  }).catch(() => null);
  if (!response?.ok) return "";
  const type = response.headers.get("content-type") ?? "";
  if (!type.includes("html") && !type.includes("text")) return "";
  const body = await response.text().catch(() => "");
  return strip(body.slice(0, 400_000)).slice(0, 12_000);
}

export const webPartPrompt = `당신은 웹 페이지에서 부품 정보를 찾아 옮기는 사람입니다.

아래는 어떤 제품의 교체 부품을 찾기 위해 검색한 웹 페이지들의 본문입니다.
각 페이지에는 출처 번호와 주소가 붙어 있습니다.

할 일:
- 찾는 제품과 부품에 해당하는 부품 이름·부품번호·호환 모델을 페이지에 적힌 대로만 옮깁니다.
- 페이지에 없는 부품번호를 기억이나 추측으로 채우지 않습니다. 없으면 빈 문자열로 둡니다.
- 모든 주장에는 근거가 된 출처 번호를 남깁니다. 출처가 없는 내용은 적지 않습니다.
- 구매 가능한 판매처 링크가 페이지에 있으면 purchases에 적습니다. 주소는 페이지에 실제로 있는 것만 씁니다.
- 페이지들이 서로 다른 말을 하면 note에 그 사실을 적습니다.
- 찾는 제품과 무관한 페이지는 무시합니다. 쓸 내용이 하나도 없으면 partName을 빈 문자열로 둡니다.

JSON만 출력합니다:
{"partName":"","partNumber":"","compatibleModels":[],"note":"","sourceIndexes":[],"purchases":[{"seller":"","url":""}]}`;

/**
 * The whole lookup, on a single search.
 *
 * A keyless search engine throttles hard, and this used to ask three times per
 * lookup — for the part, for shops, for the best price — which is what being
 * cut off looks like. One search answers all three: the readable pages become
 * the part details, and the marketplace results, which block readers anyway,
 * become the places to buy it. `ask` is the model call, injected so tests never
 * reach out.
 */
export async function lookupPartOnWeb(
  product: string,
  partLabel: string,
  ask: (system: string, user: string) => Promise<string>,
  deps: { fetchImpl?: typeof fetch; pages?: number } = {},
): Promise<WebPart | null> {
  const product_ = product.trim();
  if (!product_) return null;
  const fetchImpl = deps.fetchImpl ?? fetch;
  const found = await searchWeb(
    `${product_} ${partLabel} 구매`.trim(),
    12,
    fetchImpl,
  );
  if (!found.length) return null;
  const shops: WebShop[] = [];
  const readable: WebSource[] = [];
  const listings: { shop: WebShop; rank: number }[] = [];
  for (const result of found) {
    const seller = sellerOf(result.url);
    if (!seller || !knownSeller(result.url)) {
      readable.push(result);
      continue;
    }
    // A listing that is not the part at all is dropped rather than kept:
    // leaving the seller out lets its built search link take the slot instead.
    const rank = listingRank(result.title, partLabel);
    if (!rank) continue;
    listings.push({
      shop: {
        seller,
        title: result.title.slice(0, 80),
        url: result.url,
        snippet: result.snippet ?? "",
      },
      rank,
    });
  }
  // One listing per shop, and it is the shop's best one — a sort that keeps
  // the search engine's order within a rank. A second listing from a shop
  // already offered crowds out another shop's price, which is the only reason
  // several are offered at all.
  for (const { shop } of [...listings].sort((a, b) => b.rank - a.rank)) {
    if (shops.some((offered) => offered.seller === shop.seller)) continue;
    shops.push(shop);
  }
  // Every shop is offered, never one: the next one along may be half the price.
  // The built marketplace links are always there, so a lookup that reads
  // nothing still ends with somewhere to buy the thing.
  const withShops = (query: string) => {
    const built = shopSearchLinks(query).filter(
      (link) => !shops.some((shop) => shop.seller === link.seller),
    );
    return [...shops, ...built].slice(0, 14);
  };
  const purchases = withShops(`${product_} ${partLabel}`.trim());
  const linksOnly: WebPart = {
    partName: "",
    partNumber: "",
    compatibleModels: [],
    note: "찾은 페이지의 본문을 읽지 못했어요. 아래 링크를 직접 확인해 주세요.",
    sources: readable.slice(0, 4),
    purchases,
  };
  const pages = await Promise.all(
    readable.slice(0, deps.pages ?? 4).map(async (source) => ({
      source,
      text: await fetchPageText(source.url, fetchImpl),
    })),
  );
  const usable = pages.filter((p) => p.text.length > 200);
  if (!usable.length) return linksOnly;
  const body = usable
    .map(
      (p, i) =>
        `[출처 ${i + 1}] ${p.source.title}\n주소: ${p.source.url}\n본문: ${p.text}`,
    )
    .join("\n\n");
  const answer = await ask(
    webPartPrompt,
    `찾는 제품: ${product_}\n찾는 부품: ${partLabel}\n\n${body}`,
  ).catch(() => "");
  const json = answer
    .trim()
    .replace(/^```(?:json)?/u, "")
    .replace(/```$/u, "");
  const sourcesRead = usable.map((p) => p.source).slice(0, 4);
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(json) as Record<string, unknown>;
  } catch {
    return { ...linksOnly, sources: sourcesRead };
  }
  const partName = String(parsed.partName ?? "").slice(0, 80);
  if (!partName)
    return {
      ...linksOnly,
      note: "읽은 페이지에서 부품 정보를 찾지 못했어요. 아래 링크를 확인해 주세요.",
      sources: sourcesRead,
    };
  const indexes = Array.isArray(parsed.sourceIndexes)
    ? parsed.sourceIndexes
        .map((n) => Number(n))
        .filter((n) => Number.isInteger(n) && n >= 1 && n <= usable.length)
    : [];
  const urls = new Set(usable.map((p) => p.source.url));
  const partNumber = String(parsed.partNumber ?? "").slice(0, 60);
  // A page that sells the part directly belongs with the shops, not the sources.
  const cited = (Array.isArray(parsed.purchases) ? parsed.purchases : [])
    .map((x) => x as { seller?: unknown; url?: unknown })
    .filter(
      (x) =>
        typeof x.url === "string" &&
        urls.has(x.url) &&
        !purchases.some((shop) => shop.url === x.url),
    )
    .map((x) => ({
      seller: String(x.seller ?? "").slice(0, 40) || sellerOf(String(x.url)),
      title: "",
      url: String(x.url),
      snippet: "",
    }));
  return {
    partName,
    partNumber,
    compatibleModels: (Array.isArray(parsed.compatibleModels)
      ? parsed.compatibleModels
      : []
    )
      .map((m) => String(m).slice(0, 60))
      .slice(0, 8),
    note: String(parsed.note ?? "").slice(0, 300),
    sources: (indexes.length
      ? indexes.map((i) => usable[i - 1]!.source)
      : sourcesRead
    ).slice(0, 4),
    // A part number searches the shops far better than a product name does.
    purchases: [
      ...cited,
      ...withShops(
        partNumber
          ? `${partNumber} ${partLabel}`.trim()
          : `${product_} ${partLabel}`.trim(),
      ),
    ].slice(0, 14),
  };
}
