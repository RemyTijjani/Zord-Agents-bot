import { appBaseUrl, clearOidcCookie, isActiveAdmin, readOidcCookie, setSessionCookie, verifyTelegramIdToken } from "../../../../../api/_lib/auth.js";

export default async function handler(req: any, res: any) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).send("Method not allowed.");
  }
  const cookieHeader = typeof req.headers.cookie === "string" ? req.headers.cookie : "";
  const oidcCookiePresent = cookieHeader.split(";").some((part: string) => part.trim().startsWith("zord_oidc_state="));
  const pending = readOidcCookie(req);
  clearOidcCookie(req, res);
  const state = typeof req.query?.state === "string" ? req.query.state : "";
  const code = typeof req.query?.code === "string" ? req.query.code : "";
  if (!pending || !state || state !== pending.state || !code || req.query?.error) {
    const reason = !pending ? "oidc_cookie_missing_or_invalid" :
      !state ? "state_missing" : state !== pending.state ? "state_mismatch" :
      !code ? "authorization_code_missing" : "provider_returned_error";
    console.warn("[telegram-auth] callback validation failed", {
      reason,
      oidcCookiePresent,
      oidcCookieValid: Boolean(pending),
      statePresent: Boolean(state),
      codePresent: Boolean(code),
      providerErrorPresent: Boolean(req.query?.error),
    });
    return res.redirect(302, "/sign-in?error=telegram_login_cancelled");
  }
  try {
    const clientId = process.env.TELEGRAM_LOGIN_CLIENT_ID;
    const clientSecret = process.env.TELEGRAM_LOGIN_CLIENT_SECRET;
    if (!clientId || !clientSecret) throw new Error("Telegram login credentials are not configured.");
    const redirectUri = appBaseUrl() + "/api/auth/telegram/callback";
    const tokenResponse = await fetch("https://oauth.telegram.org/token", {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(clientId + ":" + clientSecret).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        code_verifier: pending.verifier,
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!tokenResponse.ok) throw new Error("Telegram rejected the login code.");
    const tokens = await tokenResponse.json() as { id_token?: string };
    if (!tokens.id_token) throw new Error("Telegram did not return an identity token.");
    const claims = await verifyTelegramIdToken(tokens.id_token, pending.nonce, clientId);
    const telegramId = String(claims.id);
    const expectedAdminId = process.env.TELEGRAM_ADMIN_ID || "1704977260";
    if (telegramId !== expectedAdminId) return res.redirect(302, "/sign-in?error=not_authorized");
    if (!(await isActiveAdmin(telegramId))) return res.redirect(302, "/sign-in?error=not_authorized");
    const name = typeof claims.name === "string" ? claims.name : "";
    const username = typeof claims.preferred_username === "string" ? claims.preferred_username : "";
    setSessionCookie(req, res, { id: telegramId, name, username });
    return res.redirect(302, "/");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Telegram login failed.";
    const safeMessage = message.includes("not configured") ? "login_not_configured" : "telegram_login_failed";
    return res.redirect(302, "/sign-in?error=" + safeMessage);
  }
}
