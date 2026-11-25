import { timingSafeEqual } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { processAgentMessage } from "../../../../api/_lib/agents.js";
import { getTelegramUpdateChat, getTelegramUpdateType, isTelegramOwnershipChange, resolveBotPermissions } from "../../../../api/_lib/telegram-operations.mjs";

type TelegramChat = { id: number | string; type: string; title?: string };
type TelegramMember = {
  status: string;
  user?: { id: number | string };
  can_delete_messages?: boolean;
  can_post_messages?: boolean;
  can_manage_chat?: boolean;
  can_restrict_members?: boolean;
};
type TelegramMessage = {
  message_id: number;
  date?: number;
  text?: string;
  caption?: string;
  chat: TelegramChat;
  from?: { id: number | string; is_bot?: boolean; username?: string; first_name?: string };
};
type TelegramUpdate = {
  update_id?: number | string;
  my_chat_member?: {
    chat: TelegramChat;
    from?: { id: number | string };
    new_chat_member: TelegramMember;
  };
  chat_member?: {
    chat: TelegramChat;
    old_chat_member: TelegramMember;
    new_chat_member: TelegramMember;
  };
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  channel_post?: TelegramMessage;
  edited_channel_post?: TelegramMessage;
};

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function telegramApi<T>(token: string, method: string, body: object): Promise<T> {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  const payload = await response.json() as { ok?: boolean; result?: T };
  if (!response.ok || payload.ok !== true) {
    throw new Error("Telegram API request failed.");
  }
  return payload.result as T;
}

async function syncCommunity(
  sql: any,
  token: string,
  event: NonNullable<TelegramUpdate["my_chat_member"]>,
): Promise<void> {
  const { chat, from, new_chat_member: botMember } = event;
  if (!["group", "supergroup", "channel"].includes(chat.type)) return;

  const status = botMember.status;
  const isGone = status === "left" || status === "kicked";
  const isAdmin = status === "administrator" || status === "creator";

  let ownerId: string | null = null;
  if (isAdmin && !isGone) {
    try {
      const admins = await telegramApi<Array<{ status: string; user?: { id: number | string } }>>(
        token,
        "getChatAdministrators",
        { chat_id: String(chat.id) },
      );
      const creator = admins.find((member) => member.status === "creator");
      if (creator?.user?.id !== undefined) ownerId = String(creator.user.id);
    } catch {
      // Keep the community restricted until Telegram ownership can be verified.
    }
  }

  const permissions = isGone ? resolveBotPermissions(chat.type, { status: "left" }) : resolveBotPermissions(chat.type, botMember);
  const communityStatus = isGone ? "left" : isAdmin && ownerId ? "active" : "restricted";

  await sql`
    INSERT INTO public.telegram_communities (
      telegram_chat_id, chat_type, title, added_by_telegram_user_id,
      owner_telegram_user_id, bot_status, ownership_verified_at, bot_permissions,
      last_seen_at, updated_at
    )
    VALUES (
      ${String(chat.id)}::bigint, ${chat.type}, ${chat.title ?? ""},
      ${from?.id === undefined ? null : String(from.id)}::bigint,
      ${ownerId}::bigint, ${communityStatus},
      CASE WHEN ${ownerId}::bigint IS NULL THEN NULL ELSE now() END,
      ${JSON.stringify(permissions)}::jsonb, now(), now()
    )
    ON CONFLICT (telegram_chat_id) DO UPDATE SET
      chat_type = EXCLUDED.chat_type,
      title = EXCLUDED.title,
      added_by_telegram_user_id = COALESCE(EXCLUDED.added_by_telegram_user_id, telegram_communities.added_by_telegram_user_id),
      owner_telegram_user_id = COALESCE(EXCLUDED.owner_telegram_user_id, telegram_communities.owner_telegram_user_id),
      bot_status = EXCLUDED.bot_status,
      bot_permissions = EXCLUDED.bot_permissions,
      ownership_verified_at = CASE
        WHEN EXCLUDED.owner_telegram_user_id IS NOT NULL THEN now()
        ELSE telegram_communities.ownership_verified_at
      END,
      last_seen_at = now(),
      updated_at = now()
  `;
  // Seed the community-specific profile from Telegram metadata without overwriting owner edits.
  try {
    const chatInfo = await telegramApi<{ title?: string; description?: string; bio?: string }>(
      token, "getChat", { chat_id: String(chat.id) },
    );
    await sql`
      INSERT INTO public.community_intelligence_profiles
        (telegram_chat_id, community_name, description, profile_source)
      VALUES (
        ${String(chat.id)}::bigint,
        ${chatInfo.title ?? chat.title ?? ""},
        ${chatInfo.description ?? chatInfo.bio ?? ""},
        'telegram_metadata'
      )
      ON CONFLICT (telegram_chat_id) DO UPDATE SET
        community_name = CASE WHEN community_intelligence_profiles.community_name = '' THEN EXCLUDED.community_name ELSE community_intelligence_profiles.community_name END,
        description = CASE WHEN community_intelligence_profiles.description = '' THEN EXCLUDED.description ELSE community_intelligence_profiles.description END,
        updated_at = now()
    `;
  } catch {
    // Best-effort metadata discovery; owners can edit the profile later.
  }
}

async function refreshCommunityOwner(sql: any, token: string, event: NonNullable<TelegramUpdate["chat_member"]>): Promise<void> {
  if (!isTelegramOwnershipChange({ chat_member: event })) return;
  try {
    const admins = await telegramApi<Array<{ status: string; user?: { id: number | string } }>>(
      token,
      "getChatAdministrators",
      { chat_id: String(event.chat.id) },
    );
    const creator = admins.find((member) => member.status === "creator");
    if (creator?.user?.id === undefined) return;
    await sql`
      UPDATE public.telegram_communities
      SET owner_telegram_user_id = ${String(creator.user.id)}::bigint,
          ownership_verified_at = now(),
          updated_at = now()
      WHERE telegram_chat_id = ${String(event.chat.id)}::bigint
        AND bot_status = 'active'
    `;
  } catch {
    // Keep the last verified owner if Telegram cannot be queried.
  }
}
export default async function handler(req: any, res: any) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!token || !secret) {
    return res.status(503).json({ error: "Telegram bot webhook is not configured." });
  }

  const suppliedSecret = req.headers["x-telegram-bot-api-secret-token"];
  if (typeof suppliedSecret !== "string" || !safeEqual(suppliedSecret, secret)) {
    return res.status(401).json({ error: "Unauthorized webhook request." });
  }

  let update: TelegramUpdate;
  try {
    update = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ error: "Invalid update payload." });
  }

  const updateId = update?.update_id;
  if (updateId === undefined || !/^\d+$/.test(String(updateId))) {
    return res.status(400).json({ error: "Invalid Telegram update ID." });
  }

  const chat = getTelegramUpdateChat(update) as TelegramChat | undefined;
  const chatId = chat?.id === undefined ? null : String(chat.id);
  const updateType = getTelegramUpdateType(update);

  try {
    if (!process.env.DATABASE_URL) throw new Error("Database is not configured.");
    const sql = neon(process.env.DATABASE_URL);
    const claimed = await sql`
      INSERT INTO public.telegram_updates (
        update_id, update_type, chat_id, status, attempt_count, processing_started_at
      )
      VALUES (
        ${String(updateId)}::bigint, ${updateType}, ${chatId}::bigint,
        'processing', 0, now()
      )
      ON CONFLICT (update_id) DO UPDATE SET
        status = 'processing',
        attempt_count = telegram_updates.attempt_count + 1,
        error = NULL,
        processing_started_at = now()
      WHERE telegram_updates.status = 'failed'
         OR (
           telegram_updates.status IN ('received', 'processing')
           AND telegram_updates.processing_started_at < now() - interval '5 minutes'
         )
      RETURNING update_id
    `;

    if (claimed.length === 0) {
      return res.status(200).json({ ok: true, duplicate: true });
    }

    if (update.my_chat_member) {
      await syncCommunity(sql, token, update.my_chat_member);
    }
    if (update.chat_member) {
      await refreshCommunityOwner(sql, token, update.chat_member);
    }
    const message = update.message ?? update.edited_message ?? update.channel_post ?? update.edited_channel_post;
    if (message) {
      await processAgentMessage(sql, token, message);
    }

    await sql`
      UPDATE public.telegram_updates
      SET status = 'processed', processed_at = now(), error = NULL
      WHERE update_id = ${String(updateId)}::bigint
    `;
    return res.status(200).json({ ok: true });
  } catch {
    try {
      if (process.env.DATABASE_URL) {
        const sql = neon(process.env.DATABASE_URL);
        await sql`
          UPDATE public.telegram_updates
          SET status = 'failed', error = 'webhook_processing_failed'
          WHERE update_id = ${String(updateId)}::bigint
        `;
      }
    } catch {
      // Do not expose database details to Telegram or the public endpoint.
    }
    return res.status(500).json({ error: "Webhook processing failed." });
  }
}
