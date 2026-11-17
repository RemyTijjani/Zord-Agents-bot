import { createHmac, timingSafeEqual } from "node:crypto";
import { neon } from "@neondatabase/serverless";

function safeEqualHex(left: string, right: string): boolean {
  if (!/^[a-f0-9]{64}$/i.test(left) || !/^[a-f0-9]{64}$/i.test(right)) return false;
  const a = Buffer.from(left, "hex");
  const b = Buffer.from(right, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

function verifyRequest(req: any, secret: string): boolean {
  const timestamp = req.headers["x-zord-timestamp"];
  const signature = req.headers["x-zord-signature"];
  if (typeof timestamp !== "string" || !/^\d{10}$/.test(timestamp)) return false;
  if (typeof signature !== "string") return false;
  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (age > 300) return false;
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) return false;
  const raw = JSON.stringify(req.body);
  const expected = createHmac("sha256", secret).update(timestamp + "." + raw).digest("hex");
  return safeEqualHex(signature, expected);
}

function validTelegramId(value: unknown): value is string {
  return typeof value === "string" && /^\d{5,20}$/.test(value);
}

function validDateOrNull(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && !Number.isNaN(Date.parse(value)));
}

export default async function handler(req: any, res: any) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }

  const secret = process.env.ZORD_MARKETPLACE_WEBHOOK_SECRET;
  if (!secret || secret.length < 32) {
    return res.status(503).json({ error: "Marketplace integration is not configured." });
  }
  if (!verifyRequest(req, secret)) {
    return res.status(401).json({ error: "Unauthorized integration request." });
  }
  if (!process.env.DATABASE_URL) {
    return res.status(503).json({ error: "Database is not configured." });
  }

  const body = req.body as Record<string, unknown>;
  const sql = neon(process.env.DATABASE_URL);

  try {
    if (body.action === "sync") {
      const externalId = body.external_entitlement_id;
      const telegramUserId = body.telegram_user_id;
      const moduleKey = body.module_key;
      const status = body.status;
      const startsAt = body.starts_at === undefined ? null : body.starts_at;
      const expiresAt = body.expires_at === undefined ? null : body.expires_at;

      if (typeof externalId !== "string" || externalId.length < 1 || externalId.length > 200) {
        return res.status(400).json({ error: "Invalid external entitlement ID." });
      }
      if (!validTelegramId(telegramUserId)) {
        return res.status(400).json({ error: "Invalid Telegram user ID." });
      }
      if (!["sentinel", "poly_shield", "omini_glitch"].includes(String(moduleKey))) {
        return res.status(400).json({ error: "Invalid module key." });
      }
      if (!["pending", "active", "suspended", "revoked", "expired"].includes(String(status))) {
        return res.status(400).json({ error: "Invalid entitlement status." });
      }
      if (!validDateOrNull(startsAt) || !validDateOrNull(expiresAt)) {
        return res.status(400).json({ error: "Invalid entitlement dates." });
      }
      if (startsAt && expiresAt && Date.parse(expiresAt) <= Date.parse(startsAt)) {
        return res.status(400).json({ error: "Expiry must be later than the start date." });
      }

      const metadata = body.entitlement_data && typeof body.entitlement_data === "object" && !Array.isArray(body.entitlement_data)
        ? JSON.stringify(body.entitlement_data)
        : "{}";
      const rows = await sql`
        INSERT INTO public.rental_entitlements (
          external_entitlement_id, telegram_user_id, module_key, status,
          starts_at, expires_at, last_verified_at, entitlement_data, updated_at
        )
        VALUES (
          ${externalId},
          ${telegramUserId}::bigint,
          ${String(moduleKey)},
          ${String(status)}::text,
          ${startsAt}::timestamptz,
          ${expiresAt}::timestamptz,
          now(),
          ${metadata}::jsonb,
          now()
        )
        ON CONFLICT (external_entitlement_id) DO UPDATE SET
          telegram_user_id = EXCLUDED.telegram_user_id,
          module_key = EXCLUDED.module_key,
          status = EXCLUDED.status,
          starts_at = EXCLUDED.starts_at,
          expires_at = EXCLUDED.expires_at,
          last_verified_at = now(),
          entitlement_data = EXCLUDED.entitlement_data,
          updated_at = now()
        RETURNING id, external_entitlement_id, telegram_user_id::text AS telegram_user_id,
                  module_key, status, starts_at, expires_at
      `;
      return res.status(200).json({ ok: true, entitlement: rows[0] });
    }

    if (body.action === "check") {
      const chatId = body.telegram_chat_id;
      if (typeof chatId !== "string" || !/^-?\d{5,20}$/.test(chatId)) {
        return res.status(400).json({ error: "Invalid Telegram chat ID." });
      }

      const communities = await sql`
        SELECT telegram_chat_id::text AS telegram_chat_id,
               owner_telegram_user_id::text AS owner_telegram_user_id,
               title, bot_status
        FROM public.telegram_communities
        WHERE telegram_chat_id = ${chatId}::bigint
        LIMIT 1
      `;
      const community = communities[0];
      if (!community || community.bot_status !== "active" || !community.owner_telegram_user_id) {
        return res.status(200).json({
          ok: true,
          community_verified: false,
          active_modules: [],
          reason: "community_not_verified",
        });
      }

      const entitlements = await sql`
        SELECT e.module_key, m.display_name
        FROM public.rental_entitlements e
        INNER JOIN public.agent_modules m ON m.module_key = e.module_key
        WHERE e.telegram_user_id = ${community.owner_telegram_user_id}::bigint
          AND e.status = 'active'
          AND (e.starts_at IS NULL OR e.starts_at <= now())
          AND (e.expires_at IS NULL OR e.expires_at > now())
          AND m.is_available = true
        ORDER BY e.module_key
      `;
      return res.status(200).json({
        ok: true,
        community_verified: true,
        community: { telegram_chat_id: community.telegram_chat_id, title: community.title },
        active_modules: entitlements,
      });
    }

    return res.status(400).json({ error: "Unsupported integration action." });
  } catch {
    return res.status(503).json({ error: "Marketplace entitlement operation failed." });
  }
}
