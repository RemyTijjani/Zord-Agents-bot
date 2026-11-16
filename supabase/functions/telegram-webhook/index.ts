import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

type TelegramChat = { id: number; type: string; title?: string };
type TelegramMessage = { message_id: number; chat: TelegramChat; text?: string };
type TelegramChatMemberUpdate = { chat: TelegramChat; new_chat_member: { status: string } };
type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
  my_chat_member?: TelegramChatMemberUpdate;
};

const COMMUNITY_CHAT_TYPES = ["group", "supergroup", "channel"];
const ACTIVE_MEMBER_STATUSES = ["member", "administrator"];
const REMOVED_MEMBER_STATUSES = ["left", "kicked"];

const WELCOME_TEXT = [
  "Welcome to ZORD.",
  "",
  "ZORD provides three Telegram agents for community protection and intelligence:",
  "- Sentinel: basic protection against spam, scams and malicious links.",
  "- Poly-Shield: advanced multilingual protection with contextual risk scoring.",
  "- Omini Glitch: community intelligence reports and a content studio.",
  "",
  "Send /help to see the available commands.",
].join("\n");

const HELP_TEXT = [
  "Available commands:",
  "/start - Introduction to ZORD and its agents",
  "/help - Show this list",
  "",
  "To use an agent in a group, add this bot to the group as an administrator. Agent activation is not available yet.",
].join("\n");

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function commandOf(text: string): string | null {
  const first = text.trim().split(/\s+/)[0] ?? "";
  if (!first.startsWith("/")) return null;
  return first.slice(1).split("@")[0].toLowerCase();
}

async function sendTelegramMessage(token: string, chatId: number, text: string): Promise<void> {
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.ok) {
    const description = body?.description ?? "no response from Telegram";
    throw new Error(`Telegram sendMessage failed (${res.status}): ${String(description).slice(0, 300)}`);
  }
}

async function registerCommunity(supabase: SupabaseClient, update: TelegramChatMemberUpdate): Promise<void> {
  const { chat, new_chat_member } = update;
  if (!COMMUNITY_CHAT_TYPES.includes(chat.type)) return;

  const now = new Date().toISOString();
  if (REMOVED_MEMBER_STATUSES.includes(new_chat_member.status)) {
    const { error } = await supabase.from("telegram_communities").upsert(
      {
        telegram_chat_id: chat.id,
        chat_type: chat.type,
        title: chat.title ?? "",
        status: "removed",
        last_seen_at: now,
        updated_at: now,
      },
      { onConflict: "telegram_chat_id" },
    );
    if (error) throw new Error(`Community removal update failed: ${error.message}`);
    return;
  }

  if (!ACTIVE_MEMBER_STATUSES.includes(new_chat_member.status)) return;

  const { error } = await supabase.from("telegram_communities").upsert(
    {
      telegram_chat_id: chat.id,
      chat_type: chat.type,
      title: chat.title ?? "",
      last_seen_at: now,
      updated_at: now,
    },
    { onConflict: "telegram_chat_id" },
  );
  if (error) throw new Error(`Community registration failed: ${error.message}`);
}

async function handleUpdate(supabase: SupabaseClient, token: string, update: TelegramUpdate): Promise<void> {
  if (update.my_chat_member) {
    await registerCommunity(supabase, update.my_chat_member);
    return;
  }

  const message = update.message;
  if (!message?.text || message.chat.type !== "private") return;

  const command = commandOf(message.text);
  if (command === "start") {
    await sendTelegramMessage(token, message.chat.id, WELCOME_TEXT);
  } else if (command === "help") {
    await sendTelegramMessage(token, message.chat.id, HELP_TEXT);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const webhookSecret = Deno.env.get("TELEGRAM_WEBHOOK_SECRET");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!botToken || !webhookSecret || !supabaseUrl || !serviceRoleKey) {
    return json({ error: "Telegram integration is not configured" }, 503);
  }
  if (req.headers.get("X-Telegram-Bot-Api-Secret-Token") !== webhookSecret) {
    return json({ error: "Unauthorized" }, 401);
  }

  try {
    const update = (await req.json()) as TelegramUpdate;
    if (!Number.isSafeInteger(update?.update_id) || update.update_id < 0) {
      return json({ error: "Invalid update" }, 400);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const updateType = update.message ? "message" : update.my_chat_member ? "my_chat_member" : "other";
    const chatId = update.message?.chat.id ?? update.my_chat_member?.chat.id ?? null;

    const { data: claimed, error: claimError } = await supabase.rpc("claim_telegram_update", {
      p_update_id: update.update_id,
      p_update_type: updateType,
      p_chat_id: chatId,
    });

    if (claimError) {
      console.error("Could not claim Telegram update:", claimError.message);
      return json({ error: "Could not record update" }, 500);
    }
    if (claimed !== true) {
      return json({ ok: true, duplicate: true });
    }

    try {
      await handleUpdate(supabase, botToken, update);
      const { error: completeError } = await supabase
        .from("telegram_updates")
        .update({
          status: "processed",
          error: null,
          processing_started_at: null,
          processed_at: new Date().toISOString(),
        })
        .eq("update_id", update.update_id);

      if (completeError) throw new Error(`Could not mark update processed: ${completeError.message}`);
      return json({ ok: true });
    } catch (err) {
      const message = (err instanceof Error ? err.message : "Unknown processing error").slice(0, 500);
      const { error: failureError } = await supabase
        .from("telegram_updates")
        .update({
          status: "failed",
          error: message,
          processing_started_at: null,
          processed_at: new Date().toISOString(),
        })
        .eq("update_id", update.update_id);

      if (failureError) {
        console.error("Could not record Telegram update failure:", failureError.message);
      }
      console.error("Telegram update processing failed:", message);
      return json({ error: "Update processing failed; Telegram may retry" }, 500);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown request error";
    console.error("telegram-webhook request failure:", message);
    return json({ error: "Invalid webhook request" }, 400);
  }
});
