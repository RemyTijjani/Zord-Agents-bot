import { getDatabase, isActiveAdmin, readSession } from "../_lib/auth";

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
        telegram_chat_id::text AS id,
        title,
        chat_type,
        bot_status AS status,
        first_seen_at AS added_at,
        last_seen_at
      FROM public.telegram_communities
      ORDER BY first_seen_at DESC
      LIMIT 100
    `;
    return res.status(200).json({ communities: rows });
  } catch {
    return res.status(503).json({ error: "Could not load Telegram communities." });
  }
}
