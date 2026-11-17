import { getDatabase, isActiveAdmin, readSession } from "../_lib/auth.js";

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
    const sql = getDatabase();
    const rows = await sql`
      SELECT
        c.telegram_chat_id::text AS id,
        c.title,
        c.chat_type,
        c.bot_status AS status,
        c.first_seen_at AS added_at,
        c.last_seen_at,
        COALESCE(s.enabled_modules, ARRAY[]::text[]) AS enabled_modules
      FROM public.telegram_communities c
      LEFT JOIN public.community_agent_settings s ON s.telegram_chat_id = c.telegram_chat_id
      ORDER BY first_seen_at DESC
      LIMIT 100
    `;
    return res.status(200).json({ communities: rows });
  } catch {
    return res.status(503).json({ error: "Could not load Telegram communities." });
  }
}
