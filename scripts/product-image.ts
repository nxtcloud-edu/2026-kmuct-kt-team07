/**
 * Product thumbnails for the catalog.
 *
 *   add <variantId> <pageUrl> <imageUrl> [--title "page title"] [--manifest name]
 *     Downloads one reviewed product photo, stores it as a 400px WebP and notes
 *     where it came from in .data/image-staging/<name>.jsonl. The catalog is not
 *     touched, so several people can collect photos at the same time.
 *   merge
 *     Writes every staged photo into data/catalog.json and
 *     artifacts/product-image-sources.json, then reports coverage.
 *
 * Policy: the photo must show this exact product on an official manufacturer or
 * seller page. No parts photos, brand logos or photos of a similar model.
 */
import {
  appendFile,
  mkdir,
  readdir,
  readFile,
  writeFile,
} from "node:fs/promises";
import sharp from "sharp";
import { catalogSchema, httpsUrl } from "../shared/domain.js";

const [command, ...args] = process.argv.slice(2);
const staging = ".data/image-staging";
const catalogPath = "data/catalog.json";
const reportPath = "artifacts/product-image-sources.json";
type Staged = {
  variantId: string;
  pageTitle: string;
  sourceUrl: string;
  originalImage: string;
  localUrl: string;
};

function option(name: string) {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args.splice(index, 2)[1] : undefined;
}

if (command === "add") {
  const title = option("title") ?? "";
  const manifest = (option("manifest") ?? "manual").replace(/[^a-z0-9-]/gi, "");
  const [variantId, pageUrl, imageUrl] = args;
  if (!variantId || !pageUrl || !imageUrl)
    throw new Error("사용법: add <variantId> <pageUrl> <imageUrl>");
  const catalog = catalogSchema.parse(
    JSON.parse(await readFile(catalogPath, "utf8")),
  );
  if (!catalog.products.some((p) => p.variantId === variantId))
    throw new Error(`등록되지 않은 제품입니다: ${variantId}`);
  httpsUrl.parse(pageUrl);
  httpsUrl.parse(imageUrl);
  const response = await fetch(imageUrl, {
    signal: AbortSignal.timeout(20000),
    headers: {
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
      referer: pageUrl,
    },
  });
  if (!response.ok)
    throw new Error(`사진을 받지 못했습니다: ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 1500 || bytes.length > 12_000_000)
    throw new Error(`사진 크기를 확인하세요: ${bytes.length}바이트`);
  const meta = await sharp(bytes).metadata();
  if ((meta.width ?? 0) < 120 || (meta.height ?? 0) < 120)
    throw new Error(`사진이 너무 작습니다: ${meta.width}×${meta.height}`);
  const output = await sharp(bytes)
    .rotate()
    .resize(400, 400, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();
  await mkdir("public/product-images", { recursive: true });
  await mkdir(staging, { recursive: true });
  await writeFile(`public/product-images/${variantId}.webp`, output);
  const entry: Staged = {
    variantId,
    pageTitle: title,
    sourceUrl: pageUrl,
    originalImage: imageUrl,
    localUrl: `/product-images/${variantId}.webp`,
  };
  await appendFile(
    `${staging}/${manifest}.jsonl`,
    JSON.stringify(entry) + "\n",
  );
  console.log(
    `저장: ${entry.localUrl} (${meta.width}×${meta.height} → ${output.length}바이트)`,
  );
} else if (command === "merge") {
  const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
  const report = JSON.parse(await readFile(reportPath, "utf8")) as {
    checkedAt: string;
    products: Staged[];
    policy: string;
  };
  const files = (await readdir(staging).catch(() => [])).filter((f) =>
    /^[a-z0-9-]+\.jsonl$/i.test(f),
  );
  let added = 0;
  for (const file of files)
    for (const line of (await readFile(`${staging}/${file}`, "utf8"))
      .split("\n")
      .filter(Boolean)) {
      const entry = JSON.parse(line) as Staged;
      const product = catalog.products.find(
        (p: { variantId: string }) => p.variantId === entry.variantId,
      );
      if (!product) continue;
      // The file is the proof: an entry without a readable photo is dropped.
      const meta = await sharp(`public${entry.localUrl}`)
        .metadata()
        .catch(() => null);
      if (!meta?.width) continue;
      if (!product.image) added++;
      product.image = {
        url: entry.localUrl,
        sourceUrl: entry.sourceUrl,
        alt: `${product.brand} ${product.modelName} 제품 사진`,
      };
      report.products = [
        ...report.products.filter((r) => r.variantId !== entry.variantId),
        entry,
      ];
    }
  catalogSchema.parse(catalog);
  await writeFile(catalogPath, JSON.stringify(catalog, null, 2) + "\n");
  report.checkedAt = new Date().toISOString();
  await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n");
  const withImage = catalog.products.filter(
    (p: { image?: unknown }) => p.image,
  ).length;
  console.log(
    `사진 추가 ${added}개 · 전체 ${withImage}/${catalog.products.length}개 제품에 사진이 있습니다.`,
  );
  const missing = new Map<string, number>();
  for (const p of catalog.products)
    if (!p.image) missing.set(p.brand, (missing.get(p.brand) ?? 0) + 1);
  console.log(
    "사진 없는 제품:",
    [...missing].map(([brand, count]) => `${brand} ${count}`).join(", ") ||
      "없음",
  );
} else {
  throw new Error("사용법: product-image.ts add|merge");
}
