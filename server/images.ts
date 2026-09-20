import sharp from "sharp";
export async function normalizeImage(
  bytes: Buffer,
  role: "full" | "part" | "label" = "full",
) {
  if (bytes.length > 10 * 1024 * 1024 || !bytes.length)
    throw new Error("사진은 10MB 이하여야 합니다.");
  const input = sharp(bytes, {
    limitInputPixels: 25_000_000,
    failOn: "warning",
    animated: false,
  });
  const meta = await input.metadata();
  if (
    !["jpeg", "png", "webp"].includes(meta.format ?? "") ||
    (meta.pages ?? 1) > 1
  )
    throw new Error("JPG, PNG, WebP 정지 사진만 지원합니다.");
  const size = role === "label" ? 2400 : 1600;
  const normalized = await input
    .rotate()
    .resize({
      width: size,
      height: size,
      fit: "inside",
      withoutEnlargement: true,
    })
    .flatten({ background: "#fff" })
    .jpeg({ quality: role === "label" ? 92 : 85 })
    .toBuffer();
  if (normalized.byteLength <= 3_750_000) return normalized;
  const compressed = await sharp(normalized).jpeg({ quality: 75 }).toBuffer();
  if (compressed.byteLength > 3_750_000)
    throw new Error("사진 용량을 줄여 다시 올려 주세요.");
  return compressed;
}
