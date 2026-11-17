import { appBaseUrl, isActiveAdmin, readSession } from "../_lib/auth.js";

type WebhookInfo = {
  url?: string;
  pending_update_count?: number;
  last_error_date?: number;
};

export default async function handler(req: any, res: any) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed." });
  }

  const user = readSession(req);
  if (!user) return res.status(401).json({ error: "Unauthorized." });

  try {
    if (!(await isActiveAdmin(user.id))) return res.status(401).json({ error: "Unauthorized." });

    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) return res.status(503).json({ error: "Telegram bot is not configured." });

    const response = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`, {
      method: "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    const result = await response.json() as { ok?: boolean; result?: WebhookInfo };
    if (!response.ok || result.ok !== true || !result.result) {
      return res.status(502).json({ error: "Could not verify the Telegram webhook status." });
    }

    const expectedUrl = `${appBaseUrl()}/api/telegram/webhook`;
    return res.status(200).json({
      connected: result.result.url === expectedUrl,
      pendingUpdates: result.result.pending_update_count ?? 0,
      hasRecentDeliveryError: typeof result.result.last_error_date === "number",
    });
  } catch {
    return res.status(503).json({ error: "Could not check the Telegram connection." });
  }
}
