import { isActiveAdmin, isSameOrigin, readSession } from "../_lib/auth.js";

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
    if (!token) return res.status(503).json({ error: "Telegram bot is not configured." });

    const response = await fetch(`https://api.telegram.org/bot${token}/deleteWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ drop_pending_updates: false }),
      signal: AbortSignal.timeout(12000),
    });
    const result = await response.json() as { ok?: boolean };
    if (!response.ok || result.ok !== true) {
      return res.status(502).json({ error: "Telegram could not disconnect the webhook. Try again." });
    }

    return res.status(200).json({ ok: true, message: "Telegram webhook disconnected. Pending updates were kept." });
  } catch {
    return res.status(503).json({ error: "Could not disconnect the Telegram webhook." });
  }
}
