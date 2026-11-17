import { createHash, createHmac, createPublicKey, randomBytes, timingSafeEqual, verify } from "node:crypto";
import { neon } from "@neondatabase/serverless";

export type TelegramProfile = {
  id: string;
  username?: string;
  name?: string;
};

const SESSION_COOKIE = "zord_admin_session";
const OIDC_COOKIE = "zord_oidc_state";
const SESSION_TTL_SECONDS = 8 * 60 * 60;
const OIDC_TTL_SECONDS = 10 * 60;

function secret(): string {
  const value = process.env.AUTH_COOKIE_SECRET;
  if (!value || Buffer.byteLength(value) < 32) {
    throw new Error("AUTH_COOKIE_SECRET must contain at least 32 bytes.");
  }
  return value;
}

function sign(value: string): string {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

function encode(value: object): string {
  const payload = Buffer.from(JSON.stringify(value)).toString("base64url");
  return payload + "." + sign(payload);
}

function decode<T>(value: string | undefined): T | null {
  if (!value) return null;
  const parts = value.split(".");
  if (parts.length !== 2) return null;
  const expected = Buffer.from(sign(parts[0]));
  const actual = Buffer.from(parts[1]);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    return JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

export function readCookie(req: any, name: string): string | undefined {
  const raw = req.headers.cookie;
  if (typeof raw !== "string") return undefined;
  for (const part of raw.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

function appendCookie(res: any, value: string): void {
  const current = res.getHeader("Set-Cookie");
  const cookies = current ? (Array.isArray(current) ? current : [current]) : [];
  res.setHeader("Set-Cookie", [...cookies, value]);
}

function cookie(req: any, name: string, value: string, maxAge: number): string {
  const secure = process.env.NODE_ENV === "production" || req.headers["x-forwarded-proto"] === "https";
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}

export function setOidcCookie(req: any, res: any, payload: object): void {
  appendCookie(res, cookie(req, OIDC_COOKIE, encode(payload), OIDC_TTL_SECONDS));
}

export function clearOidcCookie(req: any, res: any): void {
  appendCookie(res, cookie(req, OIDC_COOKIE, "", 0));
}

export function readOidcCookie(req: any): any {
  const payload = decode<any>(readCookie(req, OIDC_COOKIE));
  if (!payload || typeof payload.exp !== "number" || payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

export function setSessionCookie(req: any, res: any, profile: TelegramProfile): void {
  const now = Math.floor(Date.now() / 1000);
  const value = encode({ ...profile, iat: now, exp: now + SESSION_TTL_SECONDS });
  appendCookie(res, cookie(req, SESSION_COOKIE, value, SESSION_TTL_SECONDS));
}

export function clearSessionCookie(req: any, res: any): void {
  appendCookie(res, cookie(req, SESSION_COOKIE, "", 0));
}

export function readSession(req: any): TelegramProfile | null {
  const payload = decode<any>(readCookie(req, SESSION_COOKIE));
  const now = Math.floor(Date.now() / 1000);
  if (!payload || typeof payload.id !== "string" || typeof payload.exp !== "number" || payload.exp <= now) return null;
  if (payload.id !== (process.env.TELEGRAM_ADMIN_ID || "1704977260")) return null;
  return { id: payload.id, username: payload.username, name: payload.name };
}

export function appBaseUrl(): string {
  const value = process.env.APP_BASE_URL;
  if (!value) throw new Error("APP_BASE_URL is not configured.");
  const url = new URL(value);
  if (url.protocol !== "https:" && process.env.NODE_ENV === "production") {
    throw new Error("APP_BASE_URL must use HTTPS in production.");
  }
  return url.origin;
}

export function getDatabase() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured.");
  return neon(process.env.DATABASE_URL);
}

export async function isActiveAdmin(telegramId: string): Promise<boolean> {
  const sql = getDatabase();
  const rows = await sql`SELECT 1 FROM public.admins WHERE telegram_user_id = ${telegramId}::bigint AND is_active = TRUE LIMIT 1`;
  return rows.length === 1 && telegramId === (process.env.TELEGRAM_ADMIN_ID || "1704977260");
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function base64urlSha256(value: string): string {
  return createHash("sha256").update(value).digest("base64url");
}

export async function verifyTelegramIdToken(token: string, expectedNonce: string, clientId: string): Promise<any> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid Telegram ID token.");
  const header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
  const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  if (header.alg !== "RS256" || typeof header.kid !== "string") throw new Error("Unsupported Telegram token signature.");
  const response = await fetch("https://oauth.telegram.org/.well-known/jwks.json", { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error("Could not retrieve Telegram signing keys.");
  const jwks = await response.json() as { keys?: any[] };
  const jwk = jwks.keys?.find((key: any) => key.kid === header.kid && key.kty === "RSA");
  if (!jwk) throw new Error("Telegram signing key was not found.");
  const publicKey = createPublicKey({ key: jwk, format: "jwk" });
  const signature = Buffer.from(parts[2], "base64url");
  const valid = verify("RSA-SHA256", Buffer.from(parts[0] + "." + parts[1]), publicKey, signature);
  const now = Math.floor(Date.now() / 1000);
  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!valid || claims.iss !== "https://oauth.telegram.org" || !audience.includes(clientId) ||
      typeof claims.exp !== "number" || claims.exp <= now ||
      typeof claims.iat !== "number" || claims.iat > now + 60 || now - claims.iat > 600 ||
      claims.nonce !== expectedNonce || !claims.sub || !claims.id) {
    throw new Error("Telegram identity verification failed.");
  }
  return claims;
}

export function isSameOrigin(req: any): boolean {
  const origin = req.headers.origin;
  if (typeof origin !== "string") return false;
  try {
    return new URL(origin).origin === appBaseUrl();
  } catch {
    return false;
  }
}

export { SESSION_COOKIE, OIDC_COOKIE };
