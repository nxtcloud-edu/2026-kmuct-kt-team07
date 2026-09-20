import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

export function configurationIssues(env: NodeJS.ProcessEnv): string[] {
  const issues: string[] = [];
  if (env.NODE_ENV !== "production") issues.push("NODE_ENV: production 필요");
  try {
    const url = new URL(env.APP_ORIGIN ?? "");
    if (
      url.protocol !== "https:" ||
      url.origin !== env.APP_ORIGIN ||
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
      url.hostname.endsWith(".example") ||
      url.hostname.endsWith(".invalid") ||
      /(^|\.)example\.(com|org|net)$/.test(url.hostname)
    )
      issues.push("APP_ORIGIN: 실제 서비스의 HTTPS Origin 필요");
  } catch {
    issues.push("APP_ORIGIN: 실제 서비스의 HTTPS Origin 필요");
  }
  try {
    const url = new URL(env.AI_API_BASE_URL ?? "");
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      issues.push("AI_API_BASE_URL: 인증 정보·쿼리 없는 HTTPS 주소 필요");
  } catch {
    issues.push("AI_API_BASE_URL: 인증 정보·쿼리 없는 HTTPS 주소 필요");
  }
  for (const key of ["AI_API_KEY", "AI_MODEL"])
    if (!env[key]?.trim()) issues.push(`${key}: 설정 필요`);
  const limit = Number(env.AI_DAILY_REQUEST_LIMIT);
  if (!Number.isInteger(limit) || limit < 1 || limit > 10000)
    issues.push("AI_DAILY_REQUEST_LIMIT: 1~10000의 명시적인 정수 필요");
  if (!env.DATABASE_PATH || env.DATABASE_PATH === ":memory:")
    issues.push("DATABASE_PATH: 지속 저장 경로 필요");
  if (env.NODE_TLS_REJECT_UNAUTHORIZED === "0")
    issues.push("NODE_TLS_REJECT_UNAUTHORIZED: TLS 검증 비활성화 금지");
  return issues;
}

// Never return matching values, snippets, or raw file contents.
export async function publicAssetIssues(
  root: string,
  env: NodeJS.ProcessEnv,
): Promise<string[]> {
  const issues: string[] = [];
  const values = ["AI_API_KEY", "AI_API_BASE_URL"]
    .filter((key) => Boolean(env[key]?.trim()))
    .map((key) => ({ key, value: Buffer.from(env[key]!.trim()) }));
  async function visit(directory: string) {
    for (const file of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, file.name);
      if (file.isSymbolicLink()) {
        issues.push("공개 빌드에 심볼릭 링크가 있습니다.");
        continue;
      }
      if (file.isDirectory()) {
        await visit(path);
        continue;
      }
      if (!file.isFile()) continue;
      if (/^\.env(?:\.|$)|\.sqlite(?:-|$)|\.map$/.test(file.name))
        issues.push("공개 빌드에 환경 파일·DB·소스맵이 있습니다.");
      const contents = await readFile(path);
      for (const { key, value } of values)
        if (contents.includes(value))
          issues.push(`공개 빌드에 ${key} 값이 포함되어 있습니다.`);
    }
  }
  await visit(root);
  return [...new Set(issues)];
}
