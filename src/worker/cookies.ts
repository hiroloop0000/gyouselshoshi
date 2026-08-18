export function csrfCookie(token: string, maxAgeSeconds = 60 * 60 * 24 * 7): string {
  return `gp_csrf=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAgeSeconds}; Secure; SameSite=Strict`;
}

export function expiredCsrfCookie(): string {
  return "gp_csrf=; Path=/; Max-Age=0; Secure; SameSite=Strict";
}
