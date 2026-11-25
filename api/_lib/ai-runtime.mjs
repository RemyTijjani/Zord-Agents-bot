const SEVERITY_ORDER = { low: 0, medium: 1, high: 2 };

export function getAiConfig(env = process.env) {
  const apiKey = typeof env.ZORD_AI_API_KEY === "string" ? env.ZORD_AI_API_KEY.trim() : "";
  const model = typeof env.ZORD_AI_MODEL === "string" ? env.ZORD_AI_MODEL.trim() : "";
  const endpoint = typeof env.ZORD_AI_API_URL === "string" && env.ZORD_AI_API_URL.trim()
    ? env.ZORD_AI_API_URL.trim()
    : "https://api.openai.com/v1/chat/completions";
  if (!apiKey || !model || model.length > 160) return null;

  try {
    const parsed = new URL(endpoint);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) return null;
  } catch {
    return null;
  }
  return { apiKey, model, endpoint };
}

function responseText(payload) {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((part) => part && (part.type === "text" || typeof part.text === "string"))
      .map((part) => typeof part.text === "string" ? part.text : "")
      .join("\n");
  }
  return null;
}

export async function completeChat(system, user, maxTokens = 350, env = process.env, fetchImpl = fetch) {
  const config = getAiConfig(env);
  if (!config || typeof fetchImpl !== "function") return null;
  const safeSystem = typeof system === "string" ? system.slice(0, 12000) : "";
  const safeUser = typeof user === "string" ? user.slice(0, 4000) : "";
  if (!safeSystem || !safeUser) return null;

  try {
    const response = await fetchImpl(config.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0.2,
        max_tokens: Math.max(32, Math.min(800, Math.trunc(maxTokens) || 350)),
        messages: [
          { role: "system", content: safeSystem },
          { role: "user", content: safeUser },
        ],
      }),
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) return null;
    const payload = await response.json();
    const content = responseText(payload);
    return typeof content === "string" && content.trim() ? content.trim().slice(0, 3500) : null;
  } catch {
    return null;
  }
}

export function parsePolyShieldClassification(raw) {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const cleaned = raw.trim().replace(/^\x60{3}(?:json)?\s*/i, "").replace(/\s*\x60{3}$/i, "");
  try {
    const parsed = JSON.parse(cleaned);
    if (!parsed || typeof parsed !== "object" || typeof parsed.flagged !== "boolean") return null;
    const severity = ["low", "medium", "high"].includes(parsed.severity) ? parsed.severity : "medium";
    const reason = typeof parsed.reason === "string"
      ? parsed.reason.toLowerCase().replace(/[^a-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 80)
      : "multilingual_classification";
    return { flagged: parsed.flagged, severity, reason: reason || "multilingual_classification" };
  } catch {
    return null;
  }
}

export function mergePolyShieldFinding(fallback, modelFinding) {
  const local = fallback && fallback.flagged === true
    ? { flagged: true, severity: SEVERITY_ORDER[fallback.severity] === undefined ? "medium" : fallback.severity, reason: fallback.reason || "keyword_fallback" }
    : { flagged: false, severity: "low", reason: "no_finding" };
  if (!modelFinding || modelFinding.flagged !== true) return local;
  const modelSeverity = SEVERITY_ORDER[modelFinding.severity] === undefined ? "medium" : modelFinding.severity;
  if (!local.flagged) return { flagged: true, severity: modelSeverity, reason: modelFinding.reason || "multilingual_classification" };
  const severity = SEVERITY_ORDER[modelSeverity] > SEVERITY_ORDER[local.severity] ? modelSeverity : local.severity;
  return { flagged: true, severity, reason: local.reason };
}
