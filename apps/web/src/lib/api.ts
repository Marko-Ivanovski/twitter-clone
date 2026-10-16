export class ApiError extends Error {
  status: number;
  data?: unknown;

  constructor(message: string, status: number, data?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001';

type ApiRequestInit = RequestInit & { timeoutMs?: number };

const buildHeaders = (options: ApiRequestInit): HeadersInit => {
  const headers = new Headers(options.headers ?? {});

  if (
    options.body &&
    !(options.body instanceof FormData) &&
    !headers.has('Content-Type')
  ) {
    headers.set('Content-Type', 'application/json');
  }

  return headers;
};

const SKIP_REFRESH_PATHS = ['/api/auth/login', '/api/auth/register', '/api/auth/refresh'];

let refreshInFlight: Promise<boolean> | null = null;

// Concurrent 401s share one refresh request so the refresh token is used once.
const refreshSession = (): Promise<boolean> => {
  refreshInFlight ??= fetch(`${API_BASE_URL}/api/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
  })
    .then((response) => response.ok)
    .catch(() => false)
    .finally(() => {
      refreshInFlight = null;
    });
  return refreshInFlight;
};

export async function apiFetch<T>(
  path: string,
  options: ApiRequestInit = {},
): Promise<T> {
  const { timeoutMs, ...fetchOptions } = options;
  const headers = buildHeaders(fetchOptions);

  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  if (timeoutMs && !fetchOptions.signal) {
    timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  }

  const send = () =>
    fetch(`${API_BASE_URL}${path}`, {
      ...fetchOptions,
      signal: fetchOptions.signal ?? controller.signal,
      headers,
      credentials: 'include',
    });

  let response = await send();
  if (
    response.status === 401 &&
    !SKIP_REFRESH_PATHS.includes(path) &&
    (await refreshSession())
  ) {
    response = await send();
  }

  if (timeoutId) {
    clearTimeout(timeoutId);
  }

  let data: unknown = undefined;
  if (response.status !== 204) {
    try {
      data = await response.json();
    } catch {
      data = undefined;
    }
  }

  if (!response.ok) {
    const messageFromResponse =
      typeof data === 'object' &&
      data !== null &&
      'message' in data &&
      typeof (data as Record<string, unknown>).message === 'string'
        ? (data as { message: string }).message
        : null;

    const message = messageFromResponse ?? 'Request failed';

    throw new ApiError(message, response.status, data);
  }

  return data as T;
}

export const getErrorMessage = (err: unknown, fallback: string): string =>
  err instanceof Error && err.message ? err.message : fallback;
