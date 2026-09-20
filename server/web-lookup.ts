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

// One lookup asks three times. Fired together they are rate limited and come
// back empty, so searches queue up and leave a gap between them.
let searchTurn: Promise<unknown> = Promise.resolve();
const GAP_MS = 700;
// Not unref'd: the process must stay awake for a search that is only waiting.
const wait = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/** DuckDuckGo's HTML endpoint needs no key, which is all that is available. */
export async function searchWeb(
  query: string,
  limit = 5,
  fetchImpl: typeof fetch = fetch,
): Promise<WebSource[]> {
  const mine = searchTurn.then(() => wait(GAP_MS));
  searchTurn = mine;
  await mine;
  const once = async () =>
    fetchImpl(
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
      { headers: { "user-agent": UA }, signal: AbortSignal.timeout(12_000) },
    ).catch(() => null);
  let response = await once();
  let html = response?.ok ? await response.text() : "";
  // An empty page is what being throttled looks like: back off and ask again.
  if (!html.includes("result__a")) {
    await wait(1500);
    response = await once();
    html = response?.ok ? await response.text() : "";
  }
  if (!html) return [];
  const results: WebSource[] = [];
  // Each result is a link followed, usually, by the snippet that holds a price.
  const pattern =
    /class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>([\s\S]{0,1200}?)(?=class="result__a"|$)/giu;
  for (const match of html.matchAll(pattern)) {
    const href = decode(match[1]!);
    // Results are wrapped in a redirect that carries the real address.
    const target = href.includes("uddg=")
      ? decodeURIComponent(
          new URL(`https:${href}`).searchParams.get("uddg") ?? "",
        )
      : href;
    const title = strip(match[2]!);
    if (!target || !title) continue;
    if (results.some((r) => r.url === target)) continue;
    const snippet = strip(
      /class="result__snippet"[^>]*>([\s\S]*?)<\/a>/iu.exec(match[3] ?? "")?.[1] ??
        "",
    ).slice(0, 200);
    results.push({ title, url: target, snippet });
    if (results.length >= limit) break;
  }
  return results;
}

/** Hosts whose pages block readers but whose listings are what people buy from. */
const sellerNames: [RegExp, string][] = [
  [/coupang\./iu, "쿠팡"],
  [/gmarket\.|g9\./iu, "G마켓"],
  [/11st\./iu, "11번가"],
  [/auction\./iu, "옥션"],
  [/(^|\.)ssg\./iu, "SSG"],
  [/smartstore\.naver\.|shopping\.naver\./iu, "네이버쇼핑"],
  [/danawa\./iu, "다나와"],
  [/enuri\./iu, "에누리"],
  [/hmall\.|hyundaihmall\./iu, "현대Hmall"],
  [/himart\./iu, "하이마트"],
  [/electromart\.|emart\./iu, "이마트"],
  [/interpark\./iu, "인터파크"],
  [/lotteon\./iu, "롯데온"],
  [/tmon\./iu, "티몬"],
  [/wemakeprice\./iu, "위메프"],
  [/aliexpress\./iu, "알리익스프레스"],
  [/amazon\./iu, "아마존"],
  [/ebay\./iu, "이베이"],
  [/iherb\./iu, "아이허브"],
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
 * Everywhere the part is sold. One link is not an answer when the next shop is
 * half the price, so this returns every shopping result the search gives back,
 * with the snippet that usually carries the price. These pages are listed, not
 * fetched: marketplaces block readers, but their listings are the whole point.
 */
export async function findShops(
  product: string,
  part: string,
  limit = 10,
  fetchImpl: typeof fetch = fetch,
): Promise<WebShop[]> {
  const queries = [`${product} ${part} 구매`, `${product} ${part} 최저가`];
  const shops: WebShop[] = [];
  for (const query of queries) {
    for (const found of await searchWeb(query, limit, fetchImpl)) {
      if (shops.some((shop) => shop.url === found.url)) continue;
      const seller = sellerOf(found.url);
      if (!seller) continue;
      shops.push({
        seller,
        title: found.title.slice(0, 80),
        url: found.url,
        snippet: found.snippet ?? "",
      });
      if (shops.length >= limit) return shops;
    }
  }
  return shops;
}

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
  for (const result of found) {
    const seller = sellerOf(result.url);
    if (seller && knownSeller(result.url))
      shops.push({
        seller,
        title: result.title.slice(0, 80),
        url: result.url,
        snippet: result.snippet ?? "",
      });
    else readable.push(result);
  }
  // Every shop is offered, never one: the next one along may be half the price.
  const purchases = shops.slice(0, 12);
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
    partNumber: String(parsed.partNumber ?? "").slice(0, 60),
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
    purchases: [...cited, ...purchases].slice(0, 12),
  };
}
