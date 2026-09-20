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

export type WebSource = { title: string; url: string };
export type WebPart = {
  partName: string;
  partNumber: string;
  compatibleModels: string[];
  note: string;
  sources: WebSource[];
  purchases: { seller: string; url: string }[];
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

/** DuckDuckGo's HTML endpoint needs no key, which is all that is available. */
export async function searchWeb(
  query: string,
  limit = 5,
  fetchImpl: typeof fetch = fetch,
): Promise<WebSource[]> {
  const response = await fetchImpl(
    `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
    { headers: { "user-agent": UA }, signal: AbortSignal.timeout(12_000) },
  ).catch(() => null);
  if (!response?.ok) return [];
  const html = await response.text();
  const results: WebSource[] = [];
  const pattern =
    /class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/giu;
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
    results.push({ title, url: target });
    if (results.length >= limit) break;
  }
  return results;
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
 * The whole lookup: search, read the top pages, and let the observer pull the
 * part out of them. `ask` is the model call, injected so tests never reach out.
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
  // Marketplace listings rank highly for "구매" but block readers, so the plain
  // query goes first; the buying words are only a fallback.
  let found = await searchWeb(
    `${product_} ${partLabel}`,
    deps.pages ?? 4,
    fetchImpl,
  );
  if (!found.length)
    found = await searchWeb(
      `${product_} ${partLabel} 부품번호 호환`,
      deps.pages ?? 4,
      fetchImpl,
    );
  if (!found.length) return null;
  const links = found.slice(0, 4);
  // Nothing readable is still better than "없어요": hand over the pages found.
  const linksOnly: WebPart = {
    partName: "",
    partNumber: "",
    compatibleModels: [],
    note: "찾은 페이지의 본문을 읽지 못했어요. 아래 링크를 직접 확인해 주세요.",
    sources: links,
    purchases: [],
  };
  const pages = await Promise.all(
    found.map(async (source) => ({
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
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(json) as Record<string, unknown>;
  } catch {
    return { ...linksOnly, sources: usable.map((p) => p.source).slice(0, 4) };
  }
  const partName = String(parsed.partName ?? "").slice(0, 80);
  if (!partName)
    return {
      ...linksOnly,
      note: "읽은 페이지에서 부품 정보를 찾지 못했어요. 아래 링크를 확인해 주세요.",
      sources: usable.map((p) => p.source).slice(0, 4),
    };
  const indexes = Array.isArray(parsed.sourceIndexes)
    ? parsed.sourceIndexes
        .map((n) => Number(n))
        .filter((n) => Number.isInteger(n) && n >= 1 && n <= usable.length)
    : [];
  const urls = new Set(usable.map((p) => p.source.url));
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
      : usable.map((p) => p.source)
    ).slice(0, 4),
    // A link the pages never carried is a link we made up: drop it.
    purchases: (Array.isArray(parsed.purchases) ? parsed.purchases : [])
      .map((p) => p as { seller?: unknown; url?: unknown })
      .filter((p) => typeof p.url === "string" && urls.has(p.url))
      .map((p) => ({
        seller: String(p.seller ?? "").slice(0, 40),
        url: String(p.url),
      }))
      .slice(0, 4),
  };
}
