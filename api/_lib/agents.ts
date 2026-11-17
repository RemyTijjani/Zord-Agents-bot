import { createHash } from "node:crypto";

type Sql = ReturnType<typeof import("@neondatabase/serverless").neon>;
type TelegramMessage = {
  message_id: number;
  date?: number;
  text?: string;
  caption?: string;
  chat: { id: number | string; type: string; title?: string };
  from?: { id: number | string; is_bot?: boolean; username?: string; first_name?: string };
  entities?: Array<{ type: string; offset: number; length: number }>;
};

type ModuleKey = "sentinel" | "poly_shield" | "omini_glitch";

async function telegramApi(token: string, method: string, body: object): Promise<any> {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  const payload = await response.json() as { ok?: boolean; result?: any };
  if (!response.ok || payload.ok !== true) throw new Error("Telegram API request failed.");
  return payload.result;
}

function fingerprint(text: string): string {
  return createHash("sha256").update(text.slice(0, 4000)).digest("hex");
}

function command(text: string): { name: string; args: string } | null {
  const match = text.trim().match(/^\/([a-z0-9_]+)(?:@([a-z0-9_]+))?(?:\s+([\s\S]*))?$/i);
  if (!match) return null;
  return { name: match[1].toLowerCase(), args: (match[3] ?? "").trim() };
}

async function send(token: string, chatId: string, text: string, replyTo?: number): Promise<void> {
  await telegramApi(token, "sendMessage", {
    chat_id: chatId,
    text,
    ...(replyTo ? { reply_parameters: { message_id: replyTo, allow_sending_without_reply: true } } : {}),
    disable_web_page_preview: true,
  });
}

async function logAction(
  sql: Sql,
  chatId: string,
  userId: string | null,
  module: ModuleKey,
  action: string,
  severity: "info" | "low" | "medium" | "high",
  text: string,
  details: object = {},
): Promise<void> {
  await sql`
    INSERT INTO public.agent_action_logs
      (telegram_chat_id, telegram_user_id, module_key, action_key, severity, message_fingerprint, details)
    VALUES
      (${chatId}::bigint, ${userId}::bigint, ${module}, ${action}, ${severity},
       ${text ? fingerprint(text) : null}, ${JSON.stringify(details)}::jsonb)
  `;
}

async function getActiveModules(sql: Sql, chatId: string): Promise<ModuleKey[]> {
  const rows = await sql`
    SELECT DISTINCT e.module_key
    FROM public.telegram_communities c
    INNER JOIN public.community_agent_settings s ON s.telegram_chat_id = c.telegram_chat_id
    CROSS JOIN LATERAL unnest(s.enabled_modules) AS enabled(module_key)
    INNER JOIN public.agent_modules m ON m.module_key = enabled.module_key AND m.is_available = true
    INNER JOIN public.rental_entitlements e
      ON e.module_key = enabled.module_key
     AND e.telegram_user_id = c.owner_telegram_user_id
     AND e.status = 'active'
     AND (e.starts_at IS NULL OR e.starts_at <= now())
     AND (e.expires_at IS NULL OR e.expires_at > now())
    WHERE c.telegram_chat_id = ${chatId}::bigint
      AND c.bot_status = 'active'
      AND c.owner_telegram_user_id IS NOT NULL
  `;
  return rows.map((row: any) => row.module_key).filter((key: string) =>
    ["sentinel", "poly_shield", "omini_glitch"].includes(key),
  ) as ModuleKey[];
}

const suspiciousHosts = new Set([
  "bit.ly", "tinyurl.com", "t.me", "cutt.ly", "is.gd", "rb.gy", "shorturl.at",
]);

function sentinelFinding(text: string): { reason: string; severity: "medium" | "high" } | null {
  const urls = text.match(/https?:\/\/[^\s<>()]+/gi) ?? [];
  const scamLanguage = /\b(free crypto|claim your reward|double your money|wallet connect|seed phrase|recovery phrase|verify your wallet|send .* to receive|guaranteed profit|airdrop claim)\b/i.test(text);
  if (urls.length >= 4) return { reason: "multiple_links", severity: "medium" };
  if (urls.length > 0 && scamLanguage) return { reason: "scam_language_with_link", severity: "high" };
  for (const raw of urls) {
    try {
      const host = new URL(raw).hostname.toLowerCase().replace(/^www\./, "");
      if (suspiciousHosts.has(host) && scamLanguage) return { reason: "shortened_scam_link", severity: "high" };
    } catch {
      return { reason: "malformed_link", severity: "medium" };
    }
  }
  return null;
}

const toxicityTerms = [
  "kill yourself", "go die", "you are worthless", "racial slur",
  "vete a morir", "muérete", "ferme ta gueule", "va te faire",
  "اذهب للموت", "سأقتلك",
];

function polyShieldFinding(text: string): boolean {
  const normalized = text.toLocaleLowerCase();
  return toxicityTerms.some((term) => normalized.includes(term));
}

async function runSentinel(sql: Sql, token: string, message: TelegramMessage, text: string): Promise<void> {
  const finding = sentinelFinding(text);
  if (!finding) return;
  const chatId = String(message.chat.id);
  const userId = message.from?.id === undefined ? null : String(message.from.id);
  await logAction(sql, chatId, userId, "sentinel", "suspicious_message_detected", finding.severity, text, { reason: finding.reason });
  if (finding.severity === "high") {
    try {
      await telegramApi(token, "deleteMessage", { chat_id: chatId, message_id: message.message_id });
      await logAction(sql, chatId, userId, "sentinel", "message_deleted", "high", text, { reason: finding.reason });
      await send(token, chatId, "🛡️ Sentinel removed a message that matched a high-confidence scam pattern.");
    } catch {
      // The bot may not have deletion rights; the detection remains in the audit log.
    }
  }
}

async function runPolyShield(sql: Sql, token: string, message: TelegramMessage, text: string): Promise<void> {
  if (!polyShieldFinding(text)) return;
  const chatId = String(message.chat.id);
  const userId = message.from?.id === undefined ? null : String(message.from.id);
  await logAction(sql, chatId, userId, "poly_shield", "toxic_language_flagged", "medium", text);
  await send(token, chatId, "🧩 Poly-Shield: Please keep the conversation respectful. This message has been flagged for moderator review.", message.message_id);
}

async function runOminiGlitch(sql: Sql, token: string, message: TelegramMessage, text: string): Promise<void> {
  const parsed = command(text);
  if (!parsed || !["ominireport", "glitchreport"].includes(parsed.name)) return;
  const chatId = String(message.chat.id);
  const rows = await sql`
    SELECT module_key, action_key, severity, COUNT(*)::int AS total
    FROM public.agent_action_logs
    WHERE telegram_chat_id = ${chatId}::bigint
      AND created_at >= now() - interval '7 days'
    GROUP BY module_key, action_key, severity
    ORDER BY module_key, total DESC
    LIMIT 12
  `;
  const report = rows.length
    ? rows.map((row: any) => `• ${row.module_key}: ${row.action_key} — ${row.total}`).join("\n")
    : "No recorded agent actions in the last 7 days.";
  await send(token, chatId, `🧠 Omini Glitch — 7-day community report\n\n${report}`, message.message_id);
  await logAction(sql, chatId, message.from?.id === undefined ? null : String(message.from.id), "omini_glitch", "community_report_requested", "info", "");
}

export async function processAgentMessage(sql: Sql, token: string, message: TelegramMessage): Promise<void> {
  if (!message?.chat?.id || message.from?.is_bot) return;
  const text = (message.text ?? message.caption ?? "").trim();
  if (!text) return;

  const chatId = String(message.chat.id);
  const parsed = command(text);
  const modules = await getActiveModules(sql, chatId);

  if (parsed) {
    if (["start", "help", "agents"].includes(parsed.name)) {
      const active = modules.length
        ? modules.map((key) => key === "sentinel" ? "Sentinel" : key === "poly_shield" ? "Poly-Shield" : "Omini Glitch").join(", ")
        : "No agent modules are currently active for this community.";
      await send(token, chatId,
        `🤖 ZORD Personal Bot\n\nAvailable commands:\n/help — show commands\n/agents — show active agents\n/status — check this community\n/ominireport — Omini Glitch weekly report\n/ask <question> — Poly-Shield community Q&A (AI service required)\n\nActive agents: ${active}`,
        message.message_id,
      );
      return;
    }
    if (parsed.name === "status") {
      await send(token, chatId, modules.length
        ? `✅ Community verified. Active modules: ${modules.join(", ")}.`
        : "ℹ️ This community currently has no active ZORD agent rentals.", message.message_id);
      return;
    }
    if (parsed.name === "ask" && modules.includes("poly_shield")) {
      await send(token, chatId, process.env.ZORD_AI_API_KEY
        ? "Poly-Shield AI is configured but its response provider has not yet been connected."
        : "Poly-Shield Q&A is not available yet because the AI service has not been configured.", message.message_id);
      return;
    }
    if (["ominireport", "glitchreport"].includes(parsed.name) && modules.includes("omini_glitch")) {
      await runOminiGlitch(sql, token, message, text);
      return;
    }
  }

  if (modules.includes("sentinel")) await runSentinel(sql, token, message, text);
  if (modules.includes("poly_shield")) await runPolyShield(sql, token, message, text);
  if (modules.includes("omini_glitch")) await runOminiGlitch(sql, token, message, text);
}
