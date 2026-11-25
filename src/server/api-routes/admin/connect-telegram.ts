import { appBaseUrl, isActiveAdmin, isSameOrigin, readSession } from "../../../../api/_lib/auth.js";

export default async function handler(req: any, res: any) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }
  if (!isSameOrigin(req)) return res.status(403).json({ error: "Forbidden." });

  const user = readSession(req);
  if (!user) return res.status(401).json({ error: "Unauthorized." });

  try {
    if (!(await isActiveAdmin(user.id))) return res.status(401).json({ error: "Unauthorized." });
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (!token || !secret) {
      return res.status(503).json({
        error: "Add TELEGRAM_BOT_TOKEN to the Zord-Agents-bot Production environment before connecting the bot.",
      });
    }

    const webhookUrl = `${appBaseUrl()}/api/telegram/webhook`;
    const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: webhookUrl,
        secret_token: secret,
        allowed_updates: ["my_chat_member", "chat_member", "message", "edited_message", "channel_post", "edited_channel_post"],
        drop_pending_updates: false,
        max_connections: 10,
      }),
      signal: AbortSignal.timeout(12000),
    });
    const result = await response.json() as { ok?: boolean; description?: string };
    if (!response.ok || result.ok !== true) {
      return res.status(502).json({ error: "Telegram could not register the webhook. Check the bot token and try again." });
    }

    return res.status(200).json({ ok: true, message: "Telegram webhook connected." });
  } catch {
    return res.status(503).json({ error: "Could not connect the Telegram webhook." });
  }
}
