import { isActiveAdmin, readSession, getDatabase } from "../../../../api/_lib/auth.js";

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
    const [communities, restricted, updates, failed, recent] = await Promise.all([
      sql`SELECT COUNT(*)::int AS count FROM public.telegram_communities WHERE bot_status = 'active'`,
      sql`SELECT COUNT(*)::int AS count FROM public.telegram_communities WHERE bot_status = 'restricted'`,
      sql`SELECT COUNT(*)::int AS count FROM public.telegram_updates`,
      sql`SELECT COUNT(*)::int AS count FROM public.telegram_updates WHERE status = 'failed'`,
      sql`SELECT update_id, update_type, status, error, received_at FROM public.telegram_updates ORDER BY received_at DESC LIMIT 10`,
    ]);
    return res.status(200).json({
      stats: {
        communities: communities[0]?.count ?? 0,
        pendingCommunities: restricted[0]?.count ?? 0,
        updates: updates[0]?.count ?? 0,
        failedUpdates: failed[0]?.count ?? 0,
      },
      recent,
    });
  } catch {
    return res.status(503).json({ error: "Could not load dashboard overview." });
  }
}
