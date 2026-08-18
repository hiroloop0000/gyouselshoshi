const encoder = new TextEncoder();

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: "USER" | "ADMIN";
  examYear: number;
  onboardingCompleted: boolean;
  csrfToken: string;
  sessionId: string;
}

interface SessionRow {
  session_id: string;
  user_id: string;
  email: string;
  role: "USER" | "ADMIN";
  exam_year: number;
  onboarding_completed_at: string | null;
  csrf_hash: string;
}

export function getOptionalStringBinding(env: object, key: string): string | undefined {
  const value = (env as Record<string, unknown>)[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

export function base64UrlToBytes(value: string): Uint8Array {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function randomToken(size = 32): string {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

export async function sha256(value: string): Promise<string> {
  return bytesToBase64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))));
}

export async function hashPassword(password: string, salt = randomToken(18), iterations = 210_000): Promise<{
  hash: string;
  salt: string;
  iterations: number;
}> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: new Uint8Array(base64UrlToBytes(salt)), iterations },
    key,
    256,
  );
  return { hash: bytesToBase64Url(new Uint8Array(bits)), salt, iterations };
}

export async function constantTimeEqual(left: string, right: string): Promise<boolean> {
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(left)),
    crypto.subtle.digest("SHA-256", encoder.encode(right)),
  ]);
  const subtle = crypto.subtle as SubtleCrypto & {
    timingSafeEqual(a: ArrayBuffer, b: ArrayBuffer): boolean;
  };
  return subtle.timingSafeEqual(leftHash, rightHash);
}

export async function verifyPassword(password: string, expectedHash: string, salt: string, iterations: number): Promise<boolean> {
  const actual = await hashPassword(password, salt, iterations);
  return constantTimeEqual(actual.hash, expectedHash);
}

function parseCookies(header: string | null): Map<string, string> {
  const result = new Map<string, string>();
  for (const item of header?.split(";") ?? []) {
    const separator = item.indexOf("=");
    if (separator === -1) continue;
    result.set(item.slice(0, separator).trim(), decodeURIComponent(item.slice(separator + 1).trim()));
  }
  return result;
}

export function sessionCookie(token: string, maxAgeSeconds = 60 * 60 * 24 * 7): string {
  return `gp_session=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAgeSeconds}; HttpOnly; Secure; SameSite=Strict`;
}

export function expiredSessionCookie(): string {
  return "gp_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict";
}

export async function createSession(db: D1Database, userId: string): Promise<{ token: string; csrfToken: string; expiresAt: string }> {
  const token = randomToken();
  const csrfToken = randomToken();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await db
    .prepare("INSERT INTO sessions (id, user_id, token_hash, csrf_hash, expires_at) VALUES (?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), userId, await sha256(token), await sha256(csrfToken), expiresAt)
    .run();
  return { token, csrfToken, expiresAt };
}

export async function getAuthenticatedUser(request: Request, db: D1Database): Promise<AuthenticatedUser | null> {
  const token = parseCookies(request.headers.get("Cookie")).get("gp_session");
  if (!token) return null;
  const row = await db
    .prepare(
      `SELECT s.id AS session_id, s.user_id, s.csrf_hash, u.email, u.role, u.exam_year, u.onboarding_completed_at
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > CURRENT_TIMESTAMP AND u.is_active = 1`,
    )
    .bind(await sha256(token))
    .first<SessionRow>();
  if (!row) return null;
  const csrfToken = request.headers.get("X-CSRF-Token") ?? "";
  return {
    id: row.user_id,
    email: row.email,
    role: row.role,
    examYear: row.exam_year,
    onboardingCompleted: row.onboarding_completed_at !== null,
    csrfToken,
    sessionId: row.session_id,
  };
}

export async function verifyCsrf(request: Request, db: D1Database, sessionId: string): Promise<boolean> {
  const provided = request.headers.get("X-CSRF-Token");
  if (!provided) return false;
  const row = await db.prepare("SELECT csrf_hash FROM sessions WHERE id = ?").bind(sessionId).first<{ csrf_hash: string }>();
  return row ? constantTimeEqual(await sha256(provided), row.csrf_hash) : false;
}

export async function checkRateLimit(
  db: D1Database,
  bucketKey: string,
  limit: number,
  windowSeconds: number,
): Promise<{ allowed: boolean; retryAfter: number }> {
  const now = new Date();
  const row = await db
    .prepare("SELECT attempts, window_started_at, blocked_until FROM auth_rate_limits WHERE bucket_key = ?")
    .bind(bucketKey)
    .first<{ attempts: number; window_started_at: string; blocked_until: string | null }>();
  if (row?.blocked_until && Date.parse(row.blocked_until) > now.getTime()) {
    return { allowed: false, retryAfter: Math.ceil((Date.parse(row.blocked_until) - now.getTime()) / 1000) };
  }
  const windowExpired = !row || now.getTime() - Date.parse(row.window_started_at) >= windowSeconds * 1000;
  const attempts = windowExpired ? 1 : row.attempts + 1;
  const blockedUntil = attempts > limit ? new Date(now.getTime() + windowSeconds * 1000).toISOString() : null;
  await db
    .prepare(
      `INSERT INTO auth_rate_limits (bucket_key, attempts, window_started_at, blocked_until)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(bucket_key) DO UPDATE SET attempts = excluded.attempts,
       window_started_at = excluded.window_started_at, blocked_until = excluded.blocked_until`,
    )
    .bind(bucketKey, attempts, windowExpired ? now.toISOString() : row?.window_started_at, blockedUntil)
    .run();
  return { allowed: attempts <= limit, retryAfter: blockedUntil ? windowSeconds : 0 };
}

export async function validateTurnstile(env: object, token: string, remoteIp: string | undefined): Promise<boolean> {
  const secret = getOptionalStringBinding(env, "TURNSTILE_SECRET_KEY");
  if (!secret) return false;
  const form = new FormData();
  form.set("secret", secret);
  form.set("response", token);
  form.set("idempotency_key", crypto.randomUUID());
  if (remoteIp) form.set("remoteip", remoteIp);
  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) return false;
  const value: unknown = await response.json();
  return typeof value === "object" && value !== null && "success" in value && value.success === true;
}
