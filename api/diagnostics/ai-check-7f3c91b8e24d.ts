import { getAiConfig } from "../_lib/ai-runtime.mjs";

export default async function handler(req: any, res: any) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed." });
  }
  const agents = ["sentinel", "poly_shield", "omini_glitch"] as const;
  const results = await Promise.all(agents.map(async (agent) => {
    const config = getAiConfig(process.env, agent);
    if (!config) return { agent, connected: false, reason: "configuration_missing_or_invalid" };
    try {
      const response = await fetch(config.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
        body: JSON.stringify({
          model: config.model,
          temperature: 0,
          max_tokens: 16,
          messages: [
            { role: "system", content: "Reply with exactly OK." },
            { role: "user", content: "Connection test. Reply OK." },
          ],
        }),
        signal: AbortSignal.timeout(12000),
      });
      const raw = await response.text();
      let parsed: any = null;
      try { parsed = JSON.parse(raw); } catch {}
      const reply = parsed?.choices?.[0]?.message?.content;
      const connected = response.ok && (typeof reply === "string" ? reply.trim().length > 0 : Array.isArray(reply) && reply.length > 0);
      const providerMessage = typeof parsed?.error?.message === "string"
        ? parsed.error.message.replace(/https?:\/\/\S+/g, "[link]").slice(0, 240)
        : undefined;
      return {
        agent,
        model: config.model,
        httpStatus: response.status,
        connected,
        ...(providerMessage ? { providerMessage } : {}),
      };
    } catch {
      return { agent, model: config.model, connected: false, reason: "network_or_timeout" };
    }
  }));
  const allConnected = results.every((item) => item.connected);
  return res.status(allConnected ? 200 : 502).json({
    testedAt: new Date().toISOString(),
    provider: "Gemini",
    results,
    allConnected,
  });
}
