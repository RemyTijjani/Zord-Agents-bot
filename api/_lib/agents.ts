import { createHash } from "node:crypto";

type Sql = any;
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
 
async function aiCompletion(system: string, user: string, maxTokens = 350): Promise<string | null> {
  const apiKey = process.env.ZORD_AI_API_KEY;
  const model = process.env.ZORD_AI_MODEL;
  if (!apiKey || !model) return null;
  const endpoint = process.env.ZORD_AI_API_URL || "https://api.openai.com/v1/chat/completions";
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: maxTokens,
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
      }),
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) return null;
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = payload.choices?.[0]?.message?.content;
    return typeof content === "string" ? content.trim().slice(0, 3500) : null;
  } catch {
    return null;
  }
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
  const configured = await sql`
    SELECT s.enabled_modules,
           c.owner_telegram_user_id::text AS owner_telegram_user_id
    FROM public.telegram_communities c
    INNER JOIN public.community_agent_settings s ON s.telegram_chat_id = c.telegram_chat_id
    WHERE c.telegram_chat_id = ${chatId}::bigint
      AND c.bot_status = 'active'
      AND c.owner_telegram_user_id IS NOT NULL
    LIMIT 1
  `;
  if (!configured[0]) return [];
  const selected = (configured[0].enabled_modules ?? []).filter((key: string) =>
    ["sentinel", "poly_shield", "omini_glitch"].includes(key),
  ) as ModuleKey[];
  if (selected.length === 0) return [];

  // Preview-only test access is restricted to communities owned by the configured ZORD admin.
  if (
    process.env.ZORD_AGENT_TEST_MODE === "true" &&
    configured[0].owner_telegram_user_id === (process.env.TELEGRAM_ADMIN_ID || "1704977260")
  ) {
    return selected;
  }

  const rows = await sql`
    SELECT DISTINCT e.module_key
    FROM public.rental_entitlements e
    INNER JOIN public.agent_modules m ON m.module_key = e.module_key AND m.is_available = true
    WHERE e.telegram_user_id = ${configured[0].owner_telegram_user_id}::bigint
      AND e.module_key = ANY(${selected}::text[])
      AND e.status = 'active'
      AND (e.starts_at IS NULL OR e.starts_at <= now())
      AND (e.expires_at IS NULL OR e.expires_at > now())
  `;
  return rows.map((row: any) => row.module_key) as ModuleKey[];
}

type CommunityProfile = {
  community_name: string;
  description: string;
  topic: string;
  audience: string;
  focus_topics: string[];
  rules: string;
  tone: string;
  content_preferences: string;
};
async function getCommunityProfile(sql: Sql, chatId: string, chatTitle = ""): Promise<CommunityProfile> {
  const rows = await sql`
    SELECT community_name, description, topic, audience, focus_topics, rules, tone, content_preferences
    FROM public.community_intelligence_profiles
    WHERE telegram_chat_id = ${chatId}::bigint LIMIT 1
  `;
  if (rows[0]) return rows[0] as CommunityProfile;
  const fallback: CommunityProfile = {
    community_name: chatTitle || "Telegram community",
    description: "", topic: "", audience: "", focus_topics: [],
    rules: "", tone: "helpful, respectful and clear", content_preferences: "",
  };
  await sql`
    INSERT INTO public.community_intelligence_profiles (telegram_chat_id, community_name)
    VALUES (${chatId}::bigint, ${fallback.community_name})
    ON CONFLICT (telegram_chat_id) DO NOTHING
  `;
  return fallback;
}
function profileContext(profile: CommunityProfile): string {
  return [
    `Community name: ${profile.community_name || "Not specified"}`,
    `Community description: ${profile.description || "Not provided"}`,
    `Main subject: ${profile.topic || "Not confirmed; ask for clarification rather than guessing"}`,
    `Audience: ${profile.audience || "General community members"}`,
    `Focus topics: ${(profile.focus_topics ?? []).join(", ") || "Not specified"}`,
    `Community rules: ${profile.rules || "Use respectful, safe and relevant discussion"}`,
    `Preferred tone: ${profile.tone || "helpful and clear"}`,
    `Content preferences: ${profile.content_preferences || "Relevant educational and engaging content"}`,
    "Treat this profile as community-specific context, not proof of official affiliation or factual claims. Never claim to represent the named company or provide account-specific support. Do not invent policies, prices, announcements or facts.",
  ].join("\n");
}
async function updateProfileFromOwner(sql: Sql, chatId: string, userId: string, field: string, value: string): Promise<boolean> {
  const allowed = new Set(["topic", "audience", "rules", "tone", "content"]);
  if (!allowed.has(field) || !value.trim() || value.length > 1200) return false;
  const owner = await sql`
    SELECT owner_telegram_user_id::text AS owner_id FROM public.telegram_communities
    WHERE telegram_chat_id = ${chatId}::bigint AND bot_status = 'active' LIMIT 1
  `;
  if (!owner[0] || owner[0].owner_id !== userId) return false;
  await sql`
    INSERT INTO public.community_intelligence_profiles
      (telegram_chat_id, topic, audience, rules, tone, content_preferences)
    VALUES (
      ${chatId}::bigint,
      CASE WHEN ${field} = 'topic' THEN ${value.trim()} ELSE '' END,
      CASE WHEN ${field} = 'audience' THEN ${value.trim()} ELSE '' END,
      CASE WHEN ${field} = 'rules' THEN ${value.trim()} ELSE '' END,
      CASE WHEN ${field} = 'tone' THEN ${value.trim()} ELSE 'helpful, respectful and clear' END,
      CASE WHEN ${field} = 'content' THEN ${value.trim()} ELSE '' END
    )
    ON CONFLICT (telegram_chat_id) DO UPDATE SET
      topic = CASE WHEN ${field} = 'topic' THEN EXCLUDED.topic ELSE community_intelligence_profiles.topic END,
      audience = CASE WHEN ${field} = 'audience' THEN EXCLUDED.audience ELSE community_intelligence_profiles.audience END,
      rules = CASE WHEN ${field} = 'rules' THEN EXCLUDED.rules ELSE community_intelligence_profiles.rules END,
      tone = CASE WHEN ${field} = 'tone' THEN EXCLUDED.tone ELSE community_intelligence_profiles.tone END,
      content_preferences = CASE WHEN ${field} = 'content' THEN EXCLUDED.content_preferences ELSE community_intelligence_profiles.content_preferences END,
      updated_at = now()
  `;
  return true;
}

const suspiciousHosts = new Set([
  "bit.ly", "tinyurl.com", "cutt.ly", "is.gd", "rb.gy", "shorturl.at",
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
  "kill yourself", "go die", "you are worthless",
  "vete a morir", "muérete", "ferme ta gueule", "va te faire",
  "اذهب للموت", "سأقتلك",
];

function polyShieldFinding(text: string): boolean {
  const normalized = text.toLocaleLowerCase();
  return toxicityTerms.some((term) => normalized.includes(term));
}

async function runSentinel(sql: Sql, token: string, message: TelegramMessage, text: string, profile: CommunityProfile): Promise<void> {
  const contextualTerms = [profile.topic, ...profile.focus_topics].filter(Boolean).join(" ");
  const finding = sentinelFinding(text) ?? (contextualTerms && /\b(support|customer care|admin|moderator|official)\b/i.test(text) && /\b(dm me|contact me|message me|send funds|send crypto|seed phrase|verification code)\b/i.test(text) ? { reason: "community_impersonation_pattern", severity: "high" as const } : null);
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

async function runPolyShield(sql: Sql, token: string, message: TelegramMessage, text: string, profile: CommunityProfile): Promise<void> {
  let flagged = polyShieldFinding(text);
  let severity: "low" | "medium" | "high" = flagged ? "medium" : "low";
  let reason = "keyword_fallback";
  const classification = await aiCompletion(
    `You are Poly-Shield, a multilingual Telegram community safety moderator for this specific community. Use the profile to understand on-topic discussion. Classify only direct personal abuse, targeted harassment, hateful attacks or credible threats. Do not flag disagreement, criticism, jokes without a target, reclaimed language or quoted educational content. Understand any language. Community profile:\n${profileContext(profile)}\nReturn only JSON: {"flagged":boolean,"severity":"low"|"medium"|"high","reason":"short label"}.`,
    text,
    100,
  );
  if (classification) {
    try {
      const parsed = JSON.parse(classification) as { flagged?: boolean; severity?: string; reason?: string };
      if (typeof parsed.flagged === "boolean") {
        flagged = parsed.flagged;
        severity = parsed.severity === "high" ? "high" : parsed.severity === "low" ? "low" : "medium";
        reason = typeof parsed.reason === "string" ? parsed.reason.slice(0, 80) : "multilingual_toxicity";
      }
    } catch {
      // Retain the conservative local keyword result if the model returns malformed JSON.
    }
  }
  if (!flagged) return;
  const chatId = String(message.chat.id);
  const userId = message.from?.id === undefined ? null : String(message.from.id);
  await logAction(sql, chatId, userId, "poly_shield", "toxic_language_flagged", severity, text, { reason });
  await send(token, chatId, "🧩 Poly-Shield: Please keep the conversation respectful. This message has been flagged for moderator review.", message.message_id);
}

async function runOminiGlitch(sql: Sql, token: string, message: TelegramMessage, text: string, profile: CommunityProfile): Promise<void> {
  const parsed = command(text);
  if (!parsed) return;
  const chatId = String(message.chat.id);
  const userId = message.from?.id === undefined ? null : String(message.from.id);
  if (["glitch", "meme"].includes(parsed.name)) {
    if (!parsed.args) {
      await send(token, chatId, "Usage: /glitch <announcement idea> or /meme <topic>", message.message_id);
      return;
    }
    const output = await aiCompletion(
      `You are Omini Glitch. Make every result specific to this community subject, audience and content preferences, never generic. Match its tone. /meme creates a funny relevant meme; /glitch drafts an on-topic useful post. Do not invent official facts, dates, prizes or promises. Keep under 700 characters.\nCommunity profile:\n${profileContext(profile)}`,
      `${parsed.name}: ${parsed.args}`,
      220,
    );
    await send(token, chatId, output ?? "Omini Glitch content assistance needs the ZORD AI service to be configured.", message.message_id);
    await logAction(sql, chatId, userId, "omini_glitch", parsed.name === "meme" ? "meme_created" : "community_content_created", "info", text);
    return;
  }
  if (!["ominireport", "glitchreport", "glitch", "meme"].includes(parsed.name)) return;
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
  await logAction(sql, chatId, userId, "omini_glitch", "community_report_requested", "info", "");
}

export async function processAgentMessage(sql: Sql, token: string, message: TelegramMessage): Promise<void> {
  if (!message?.chat?.id || message.from?.is_bot) return;
  const text = (message.text ?? message.caption ?? "").trim();
  if (!text) return;

  const chatId = String(message.chat.id);
  const parsed = command(text);
  const modules = await getActiveModules(sql, chatId);
  const profile = await getCommunityProfile(sql, chatId, message.chat.title ?? "");

  if (parsed) {
    if (["start", "help", "agents"].includes(parsed.name)) {
      const active = modules.length
        ? modules.map((key) => key === "sentinel" ? "Sentinel" : key === "poly_shield" ? "Poly-Shield" : "Omini Glitch").join(", ")
        : "No agent modules are currently active for this community.";
      await send(token, chatId,
        `🤖 ZORD Personal Bot\n\nAvailable commands:\n/help — show commands\n/agents — show active agents\n/status — check this community\n/ominireport — Omini Glitch weekly report\n/glitch <idea> — draft a community post\n/meme <topic> — create a text meme\n/ask <question> — Poly-Shield multilingual Q&A\n\nActive agents: ${active}`,
        message.message_id,
      );
      return;
    }
    if (parsed.name === "communityprofile") {
      await send(token, chatId, `🧠 Community Intelligence\nTopic: ${profile.topic || "Not set"}\nAudience: ${profile.audience || "Not set"}\nFocus: ${(profile.focus_topics ?? []).join(", ") || "Not set"}\nTone: ${profile.tone || "Helpful and clear"}\n\nOwner commands:\n/settopic <main subject>\n/setaudience <who the group is for>\n/setrules <community rules>\n/settone <preferred tone>\n/setcontent <content and meme preferences>`, message.message_id);
      return;
    }
    if (["settopic", "setaudience", "setrules", "settone", "setcontent"].includes(parsed.name)) {
      const field = ({ settopic: "topic", setaudience: "audience", setrules: "rules", settone: "tone", setcontent: "content" } as Record<string, string> )[parsed.name];
      const saved = await updateProfileFromOwner(sql, chatId, message.from?.id === undefined ? "" : String(message.from.id), field, parsed.args);
      await send(token, chatId, saved ? "✅ Community Intelligence profile updated. All enabled agents will use the new settings." : "Only the verified group owner can update this profile. Use the command with a value up to 1,200 characters.", message.message_id);
      return;
    }
    if (parsed.name === "status") {
      await send(token, chatId, modules.length
        ? `✅ Community verified. Active modules: ${modules.join(", ")}.`
        : "ℹ️ This community currently has no active ZORD agent rentals.", message.message_id);
      return;
    }
    if (parsed.name === "ask" && modules.includes("poly_shield")) {
      if (!parsed.args) {
        await send(token, chatId, "Usage: /ask <your question>", message.message_id);
        return;
      }
      const answer = await aiCompletion(
        `You are Poly-Shield, a multilingual assistant for this specific Telegram community. Answer in the user language using the group topic, audience and rules. If the profile does not establish an answer, say so and suggest an official source or human admin. Never claim to be official company support or request passwords, seed phrases, OTPs or private keys.\nCommunity profile:\n${profileContext(profile)}`,
        parsed.args,
        300,
      );
      await send(token, chatId, answer ?? "Poly-Shield Q&A needs the ZORD AI service to be configured.", message.message_id);
      await logAction(sql, chatId, message.from?.id === undefined ? null : String(message.from.id), "poly_shield", "community_question_answered", "info", text);
      return;
    }
    if (["ominireport", "glitchreport"].includes(parsed.name) && modules.includes("omini_glitch")) {
      await runOminiGlitch(sql, token, message, text, profile);
      return;
    }
  }

  if (modules.includes("sentinel")) await runSentinel(sql, token, message, text, profile);
  if (modules.includes("poly_shield")) await runPolyShield(sql, token, message, text, profile);
  if (modules.includes("omini_glitch")) await runOminiGlitch(sql, token, message, text, profile);
}
