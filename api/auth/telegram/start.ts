import { appBaseUrl, base64urlSha256, randomToken, setOidcCookie } from "../../_lib/auth.js";

export default async function handler(req: any, res: any) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed." });
  }
  const clientId = process.env.TELEGRAM_LOGIN_CLIENT_ID;
  if (!clientId || !process.env.TELEGRAM_LOGIN_CLIENT_SECRET || !process.env.AUTH_COOKIE_SECRET || !process.env.APP_BASE_URL) {
    return res.status(503).json({ error: "Telegram login is not configured yet. Complete the deployment setup first." });
  }
  try {
    // Keep the OIDC state cookie and callback on the same canonical host.
    const canonical = new URL(appBaseUrl());
    const requestHost = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim();
    if (requestHost && requestHost.toLowerCase() !== canonical.host.toLowerCase()) {
      const requestPath = typeof req.url === "string" ? req.url : "/api/auth/telegram/start";
      return res.redirect(307, canonical.origin + requestPath);
    }
    const state = randomToken();
    const nonce = randomToken();
    const verifier = randomToken(48);
    setOidcCookie(req, res, { state, nonce, verifier, exp: Math.floor(Date.now() / 1000) + 600 });
    const setCookie = res.getHeader("Set-Cookie");
    console.info("[telegram-auth] login start", {
      setCookiePresent: Boolean(setCookie),
      setCookieCount: Array.isArray(setCookie) ? setCookie.length : setCookie ? 1 : 0,
      callbackHost: new URL(appBaseUrl()).host,
      forwardedProto: req.headers["x-forwarded-proto"] || "unknown",
    });
    const challenge = base64urlSha256(verifier);
    const redirectUri = appBaseUrl() + "/api/auth/telegram/callback";
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "openid profile",
      state,
      nonce,
      code_challenge: challenge,
      code_challenge_method: "S256",
    });
    return res.redirect(302, "https://oauth.telegram.org/auth?" + params.toString());
  } catch {
    return res.status(500).json({ error: "Could not start Telegram login." });
  }
}
