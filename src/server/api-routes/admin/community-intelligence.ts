import { getDatabase, isActiveAdmin, isSameOrigin, readSession } from "../../../../api/_lib/auth.js";
import { normalizeCommunityProfile } from "../../../../api/_lib/community-intelligence.mjs";

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
        SELECT c.telegram_chat_id::text AS chat_id, c.title,
          p.community_name, p.description, p.topic, p.audience, p.focus_topics,
          p.rules, p.tone, p.content_preferences
        FROM public.telegram_communities c
        LEFT JOIN public.community_intelligence_profiles p ON p.telegram_chat_id = c.telegram_chat_id
        WHERE c.telegram_chat_id = ${chatId}::bigint LIMIT 1
      `;
      if (!rows[0]) return res.status(404).json({ error: "Community not found." });
      return res.status(200).json({ profile: rows[0] });
    }
    if (req.method === "POST") {
      if (!isSameOrigin(req)) return res.status(403).json({ error: "Invalid request origin." });
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      const chatId = body?.chat_id;
      if (typeof chatId !== "string" || !/^-?\d{5,20}$/.test(chatId)) return res.status(400).json({ error: "Invalid Telegram chat ID." });
      const community = await sql`SELECT title, bot_status FROM public.telegram_communities WHERE telegram_chat_id = ${chatId}::bigint LIMIT 1`;
      if (!community[0] || community[0].bot_status !== "active") return res.status(409).json({ error: "Only verified active communities can update their profile." });
      const profile = normalizeCommunityProfile(body, community[0].title);
      const rows = await sql`
        INSERT INTO public.community_intelligence_profiles
          (telegram_chat_id, community_name, description, topic, audience, focus_topics, rules, tone, content_preferences, profile_source, updated_at)
        VALUES (
          ${chatId}::bigint, ${profile.community_name},
          ${profile.description}, ${profile.topic}, ${profile.audience},
          ${profile.focus_topics}::text[], ${profile.rules}, ${profile.tone},
          ${profile.content_preferences}, 'admin_dashboard', now()
        )
        ON CONFLICT (telegram_chat_id) DO UPDATE SET
          community_name = EXCLUDED.community_name, description = EXCLUDED.description,
          topic = EXCLUDED.topic, audience = EXCLUDED.audience, focus_topics = EXCLUDED.focus_topics,
          rules = EXCLUDED.rules, tone = EXCLUDED.tone, content_preferences = EXCLUDED.content_preferences,
          profile_source = 'admin_dashboard', updated_at = now()
        RETURNING telegram_chat_id::text AS chat_id, community_name, description, topic, audience, focus_topics, rules, tone, content_preferences
      `;
      await sql`
        INSERT INTO public.audit_logs (actor_telegram_user_id, action, entity_type, entity_id, details)
        VALUES (${user.id}::bigint, 'community_intelligence_profile_updated', 'telegram_community',
          ${chatId}, ${JSON.stringify({ topic: profile.topic, focus_topics: profile.focus_topics })}::jsonb)
      `;
      return res.status(200).json({ ok: true, profile: rows[0] });
    }
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed." });
  } catch {
    return res.status(503).json({ error: "Could not load or update the community intelligence profile." });
  }
}
