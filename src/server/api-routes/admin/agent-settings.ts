import { getDatabase, isActiveAdmin, isSameOrigin, readSession } from "../../../../api/_lib/auth.js";

const allowed = new Set(["sentinel", "poly_shield", "omini_glitch"]);

export default async function handler(req: any, res: any) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  const user = readSession(req);
  if (!user) return res.status(401).json({ error: "Unauthorized." });
  try {
    if (!(await isActiveAdmin(user.id))) return res.status(401).json({ error: "Unauthorized." });
    const sql = getDatabase();

    if (req.method === "GET") {
      const chatId = typeof req.query?.chat_id === "string" ? req.query.chat_id : "";
      if (!/^-?\d{5,20}$/.test(chatId)) return res.status(400).json({ error: "Invalid Telegram chat ID." });
      const rows = await sql`
        SELECT c.telegram_chat_id::text AS chat_id, c.title, c.bot_status,
               COALESCE(s.enabled_modules, ARRAY[]::text[]) AS enabled_modules
        FROM public.telegram_communities c
        LEFT JOIN public.community_agent_settings s ON s.telegram_chat_id = c.telegram_chat_id
        WHERE c.telegram_chat_id = ${chatId}::bigint
        LIMIT 1
      `;
      if (!rows[0]) return res.status(404).json({ error: "Community not found." });
      return res.status(200).json({ community: rows[0] });
    }

    if (req.method === "POST") {
      if (!isSameOrigin(req)) return res.status(403).json({ error: "Invalid request origin." });
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      const chatId = body?.chat_id;
      const modules = body?.enabled_modules;
      if (typeof chatId !== "string" || !/^-?\d{5,20}$/.test(chatId) ||
          !Array.isArray(modules) || modules.some((module: unknown) => typeof module !== "string" || !allowed.has(module))) {
        return res.status(400).json({ error: "Invalid agent settings." });
      }
      const community = await sql`
        SELECT bot_status FROM public.telegram_communities
        WHERE telegram_chat_id = ${chatId}::bigint LIMIT 1
      `;
      if (!community[0] || community[0].bot_status !== "active") {
        return res.status(409).json({ error: "Only verified active communities can enable agents." });
      }
      const uniqueModules = [...new Set(modules)] as string[];
      const rows = await sql`
        INSERT INTO public.community_agent_settings
          (telegram_chat_id, enabled_modules, updated_by_telegram_user_id, updated_at)
        VALUES
          (${chatId}::bigint, ${uniqueModules}::text[], ${user.id}::bigint, now())
        ON CONFLICT (telegram_chat_id) DO UPDATE SET
          enabled_modules = EXCLUDED.enabled_modules,
          updated_by_telegram_user_id = EXCLUDED.updated_by_telegram_user_id,
          updated_at = now()
        RETURNING telegram_chat_id::text AS chat_id, enabled_modules
      `;
      await sql`
        INSERT INTO public.audit_logs (actor_telegram_user_id, action, entity_type, entity_id, details)
        VALUES (${user.id}::bigint, 'community_agent_settings_updated', 'telegram_community',
                ${chatId}, ${JSON.stringify({ enabled_modules: uniqueModules })}::jsonb)
      `;
      return res.status(200).json({ ok: true, settings: rows[0] });
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed." });
  } catch {
    return res.status(503).json({ error: "Could not update community agent settings." });
  }
}
