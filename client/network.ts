export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

/** Bound response-body time too. Never automatically repeat a mutation. */
export async function fetchJson<T>(
  url: string,
  init: RequestInit = {},
  options: { timeoutMs?: number; fetcher?: typeof fetch } = {},
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? 45_000,
  );
  const cancel = () => controller.abort();
  if (init.signal?.aborted) cancel();
  init.signal?.addEventListener("abort", cancel, { once: true });
  try {
    const response = await (options.fetcher ?? fetch)(url, {
      ...init,
      signal: controller.signal,
    });
    if (response.status === 204) return undefined as T;
    let data: unknown;
    try {
      data = await response.json();
    } catch {
      throw new ApiError(
        "서버 응답을 읽지 못했습니다. 잠시 후 다시 시도해 주세요.",
        response.status,
      );
    }
    if (!response.ok) {
      const message =
        data &&
        typeof data === "object" &&
        "error" in data &&
        typeof data.error === "string"
          ? data.error
          : "요청을 처리하지 못했습니다. 다시 시도해 주세요.";
      throw new ApiError(message, response.status);
    }
    return data as T;
  } catch (error) {
    if (controller.signal.aborted)
      throw new ApiError(
        "연결이 오래 걸리고 있어요. 입력은 유지했습니다. 최근 찾기를 확인하거나 같은 요청을 다시 시도해 주세요.",
      );
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      "인터넷 연결을 확인해 주세요. 입력한 내용은 유지됩니다.",
    );
  } finally {
    clearTimeout(timeout);
    init.signal?.removeEventListener("abort", cancel);
  }
}

/** Only one read in flight, with backoff after failures. Cleanup cancels it. */
export function pollSerial<T>(
  read: (signal: AbortSignal) => Promise<T>,
  onValue: (value: T) => boolean,
  onError: (error: unknown) => boolean,
  intervalMs = 1500,
) {
  const controller = new AbortController();
  let stopped = false,
    failures = 0;
  let timer: ReturnType<typeof setTimeout>;
  const tick = async () => {
    if (stopped) return;
    let again = true;
    try {
      const value = await read(controller.signal);
      if (stopped) return;
      failures = 0;
      again = onValue(value);
    } catch (error) {
      if (stopped) return;
      failures++;
      again = onError(error);
    }
    if (!stopped && again)
      timer = setTimeout(
        tick,
        Math.min(intervalMs * 2 ** Math.min(failures, 4), 15000),
      );
  };
  timer = setTimeout(tick, intervalMs);
  return () => {
    stopped = true;
    clearTimeout(timer);
    controller.abort();
  };
}
