import { writeFile } from "node:fs/promises";
import { loadCatalog } from "../server/catalog.js";
const catalog = loadCatalog();
const allowed = new Set([
  "nalgene.com",
  "www.hydroflask.com",
  "www.humangear.com",
  "thermosshop.kr",
  "m.thermosshop.kr",
  "kinto.kr",
  "zojirushi.co.kr",
  "www.bugaboo.com",
  "singer-featherweight.com",
  "www.decathlon.co.uk",
  "www.canyon.com",
  "www.dyson.co.kr",
  "www.ikea.com",
  "hottracks.kyobobook.co.kr",
  "www.coupang.com",
  "m.gsshop.com",
  "www.oliveyoung.co.kr",
  "www.abcbike.co.kr",
  "us.gardena.com",
  "www.petsafe.com",
  "www.samsungsvc.co.kr",
  "www.lge.co.kr",
  "www.vileda.co.uk",
  "www.singer.com",
  "kr.element14.com",
  "www.compuzone.co.kr",
]);
const urls = [...new Set(catalog.offers.map((o) => o.source.url))];
for (const url of urls)
  if (!allowed.has(new URL(url).hostname))
    throw new Error("검수되지 않은 판매처 도메인");
const results: {
  url: string;
  status: "reachable" | "redirected" | "broken" | "blocked" | "network_error";
  checkedAt: string;
  httpStatus?: number;
}[] = [];
let next = 0;
// Bounded workers, no redirect following, no cookies/credentials, no stock inference.
await Promise.all(
  Array.from({ length: 4 }, async () => {
    while (next < urls.length) {
      const url = urls[next++]!;
      let result: (typeof results)[number] = {
        url,
        status: "network_error",
        checkedAt: new Date().toISOString(),
      };
      try {
        const response = await fetch(url, {
          redirect: "manual",
          signal: AbortSignal.timeout(15000),
          headers: { "User-Agent": "PartsFinder-LinkCheck/1.0" },
        });
        result.httpStatus = response.status;
        result.status = response.ok
          ? "reachable"
          : [404, 410].includes(response.status)
            ? "broken"
            : [401, 403, 429].includes(response.status)
              ? "blocked"
              : response.status >= 300 && response.status < 400
                ? "redirected"
                : "network_error";
        await response.body?.cancel();
      } catch {
        /* Access failure is not evidence of stock or lifecycle. */
      }
      results.push(result);
    }
  }),
);
for (const o of catalog.offers) {
  const r = results.find((r) => r.url === o.source.url)!;
  const { url, ...check } = r;
  o.linkCheck = check;
}
await writeFile(
  "artifacts/purchase-link-review.json",
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      scope:
        "HTTP access only, not stock or compatibility validation. Manual content reviews remain separate.",
      results,
    },
    null,
    2,
  ) + "\n",
);
await writeFile(
  "/tmp/catalog-purchase-check.json",
  JSON.stringify(catalog, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    urls: urls.length,
    counts: results.reduce(
      (a, r) => ({ ...a, [r.status]: (a[r.status] ?? 0) + 1 }),
      {} as Record<string, number>,
    ),
    candidate: "/tmp/catalog-purchase-check.json",
  }),
);
