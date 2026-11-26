import { completeChat } from "../_lib/ai-runtime.mjs";

export default async function handler(req: any, res: any) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed." });
  }
  const agents = ["sentinel", "poly_shield", "omini_glitch"] as const;
  const results = await Promise.all(agents.map(async (agent) => {
    const reply = await completeChat(
      "Reply with exactly OK. Do not include any other text.",
      "Connection test. Reply OK.",
      16,
      process.env,
      fetch,
      agent,
    );
    return { agent, connected: typeof reply === "string" && reply.trim().length > 0 };
  }));
  const allConnected = results.every((item) => item.connected);
  return res.status(allConnected ? 200 : 502).json({
    testedAt: new Date().toISOString(),
    provider: "Gemini",
    results,
    allConnected,
  });
}
