import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

type TelegramChat = { id: number; type: string; title?: string };
type TelegramMessage = { message_id: number; chat: TelegramChat; text?: string };
type TelegramChatMemberUpdate = { chat: TelegramChat; new_chat_member: { status: string } };
type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
  my_chat_member?: TelegramChatMemberUpdate;
};

const COMMUNITY_CHAT_TYPES = ["group", "supergroup", "channel"];
const MEMBER_STATUSES = ["member", "administrator"];

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
    headers: { ...corsHeaders, "Content-Type": "application/json" },
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
    throw new Error(`Telegram sendMessage failed (${res.status}): ${description}`);
  }
}

async function registerCommunity(supabase: SupabaseClient, update: TelegramChatMemberUpdate): Promise<void> {
  const { chat, new_chat_member } = update;
  if (!COMMUNITY_CHAT_TYPES.includes(chat.type)) return;
  if (!MEMBER_STATUSES.includes(new_chat_member.status)) return;

  const { error } = await supabase.from("telegram_communities").upsert(
    {
      telegram_chat_id: chat.id,
      chat_type: chat.type,
      title: chat.title ?? "",
      last_seen_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
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
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const webhookSecret = Deno.env.get("TELEGRAM_WEBHOOK_SECRET");
  if (!botToken || !webhookSecret) {
    return json({ error: "Telegram integration is not configured" }, 503);
  }
  if (req.headers.get("X-Telegram-Bot-Api-Secret-Token") !== webhookSecret) {
    return json({ error: "Unauthorized" }, 401);
  }

  try {
    const update = (await req.json()) as TelegramUpdate;
    if (typeof update?.update_id !== "number") {
      return json({ error: "Invalid update" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const updateType = update.message ? "message" : update.my_chat_member ? "my_chat_member" : "other";
    const chatId = update.message?.chat.id ?? update.my_chat_member?.chat.id ?? null;

    const { error: insertError } = await supabase
      .from("telegram_updates")
      .insert({ update_id: update.update_id, update_type: updateType, chat_id: chatId });
    if (insertError) {
      if (insertError.code === "23505") {
        return json({ ok: true, duplicate: true });
      }
      throw new Error(`Failed to record update: ${insertError.message}`);
    }

    try {
      await handleUpdate(supabase, botToken, update);
      await supabase
        .from("telegram_updates")
        .update({ status: "processed", processed_at: new Date().toISOString() })
        .eq("update_id", update.update_id);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      await supabase
        .from("telegram_updates")
        .update({ status: "failed", error: message, processed_at: new Date().toISOString() })
        .eq("update_id", update.update_id);
    }

    return json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("telegram-webhook failure:", message);
    return json({ error: "Internal error" }, 500);
  }
});