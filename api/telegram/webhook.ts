import { timingSafeEqual } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { processAgentMessage } from "../_lib/agents.js";

type TelegramChat = { id: number | string; type: string; title?: string };
type TelegramMember = {
  status: string;
  user?: { id: number | string };
  can_delete_messages?: boolean;
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
  message?: TelegramMessage;
  channel_post?: TelegramMessage;
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

function getUpdateType(update: TelegramUpdate): string {
  if (update.my_chat_member) return "my_chat_member";
  if (update.message) return "message";
  if (update.channel_post) return "channel_post";
  return "unknown";
}

function getChat(update: TelegramUpdate): TelegramChat | undefined {
  return update.my_chat_member?.chat ?? update.message?.chat ?? update.channel_post?.chat;
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

  const hasDeletePermission =
    status === "creator" || (status === "administrator" && botMember.can_delete_messages === true);
  const communityStatus = isGone
    ? "left"
    : isAdmin && hasDeletePermission && ownerId
      ? "active"
      : "restricted";

  await sql`
    INSERT INTO public.telegram_communities (
      telegram_chat_id, chat_type, title, added_by_telegram_user_id,
      owner_telegram_user_id, bot_status, ownership_verified_at,
      last_seen_at, updated_at
    )
    VALUES (
      ${String(chat.id)}::bigint, ${chat.type}, ${chat.title ?? ""},
      ${from?.id === undefined ? null : String(from.id)}::bigint,
      ${ownerId}::bigint, ${communityStatus},
      CASE WHEN ${ownerId}::bigint IS NULL THEN NULL ELSE now() END,
      now(), now()
    )
    ON CONFLICT (telegram_chat_id) DO UPDATE SET
      chat_type = EXCLUDED.chat_type,
      title = EXCLUDED.title,
      added_by_telegram_user_id = COALESCE(EXCLUDED.added_by_telegram_user_id, telegram_communities.added_by_telegram_user_id),
      owner_telegram_user_id = COALESCE(EXCLUDED.owner_telegram_user_id, telegram_communities.owner_telegram_user_id),
      bot_status = EXCLUDED.bot_status,
      ownership_verified_at = CASE
        WHEN EXCLUDED.owner_telegram_user_id IS NOT NULL THEN now()
        ELSE telegram_communities.ownership_verified_at
      END,
      last_seen_at = now(),
      updated_at = now()
  `;
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

  const chat = getChat(update);
  const chatId = chat?.id === undefined ? null : String(chat.id);
  const updateType = getUpdateType(update);

  try {
    if (!process.env.DATABASE_URL) throw new Error("Database is not configured.");
    const sql = neon(process.env.DATABASE_URL);
    const claimed = await sql`
      INSERT INTO public.telegram_updates (
        update_id, update_type, chat_id, status, attempt_count, processing_started_at
      )
      VALUES (
        ${String(updateId)}::bigint, ${updateType}, ${chatId}::bigint,
        'received', 0, now()
      )
      ON CONFLICT (update_id) DO UPDATE SET
        status = 'received',
        attempt_count = telegram_updates.attempt_count + 1,
        error = NULL,
        processing_started_at = now()
      WHERE telegram_updates.status = 'failed'
         OR (
           telegram_updates.status = 'received'
           AND telegram_updates.processing_started_at < now() - interval '2 minutes'
         )
      RETURNING update_id
    `;

    if (claimed.length === 0) {
      return res.status(200).json({ ok: true, duplicate: true });
    }

    if (update.my_chat_member) {
      await syncCommunity(sql, token, update.my_chat_member);
    }
    const message = update.message ?? update.channel_post;
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
