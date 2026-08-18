export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
  }
}

function csrfToken(): string | undefined {
  const match = document.cookie.split("; ").find((item) => item.startsWith("gp_csrf="));
  return match ? decodeURIComponent(match.slice("gp_csrf=".length)) : undefined;
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const csrf = csrfToken();
  if (csrf && options.method && !["GET", "HEAD", "OPTIONS"].includes(options.method.toUpperCase())) {
    headers.set("X-CSRF-Token", csrf);
  }
  const response = await fetch(path, { ...options, headers, credentials: "same-origin" });
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    data = { error: "サーバーから不正な応答を受信しました。" };
  }
  if (!response.ok) {
    const body = typeof data === "object" && data !== null ? data : {};
    const message = "error" in body && typeof body.error === "string" ? body.error : "リクエストに失敗しました。";
    const code = "code" in body && typeof body.code === "string" ? body.code : undefined;
    throw new ApiError(message, response.status, code);
  }
  return data as T;
}
