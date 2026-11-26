import test from "node:test";
import assert from "node:assert/strict";
import {
  completeChat,
  getAiConfig,
  mergePolyShieldFinding,
  parsePolyShieldClassification,
} from "../api/_lib/ai-runtime.mjs";

test("AI configuration requires credentials, model and a secure HTTPS endpoint", () => {
  assert.equal(getAiConfig({ ZORD_AI_API_KEY: "key", ZORD_AI_MODEL: "model", ZORD_AI_API_URL: "http://example.test" }), null);
  assert.equal(getAiConfig({ ZORD_AI_API_KEY: "key", ZORD_AI_MODEL: "model", ZORD_AI_API_URL: "https://user:pass@example.test/v1" }), null);
  assert.equal(getAiConfig({ ZORD_AI_API_KEY: "key", ZORD_AI_MODEL: "model" }).endpoint, "https://api.openai.com/v1/chat/completions");
  const geminiEnv = { ZORD_AI_API_KEY: "key", ZORD_AI_MODEL: "gemini-3.5-flash-lite", ZORD_AI_API_URL: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions" };
  assert.equal(getAiConfig(geminiEnv, "sentinel").model, "gemini-3.5-flash-lite");
  assert.equal(getAiConfig(geminiEnv, "poly_shield").model, "gemini-3.5-flash-lite");
  assert.equal(getAiConfig(geminiEnv, "omini_glitch").model, "gemini-3.5-flash-lite");
  assert.equal(getAiConfig({ ...geminiEnv, ZORD_AI_MODEL_POLY_SHIELD: "custom-model" }, "poly_shield").model, "custom-model");
  assert.equal(getAiConfig({ ZORD_AI_API_KEY: " ", ZORD_AI_MODEL: "model" }), null);
});

test("chat completion uses bounded inputs and extracts provider text", async () => {
  let request;
  const output = await completeChat("system", "user", 9999, {
    ZORD_AI_API_KEY: "secret",
    ZORD_AI_MODEL: "test-model",
    ZORD_AI_API_URL: "https://gateway.example/v1/chat/completions",
  }, async (url, options) => {
    request = { url, options };
    return { ok: true, json: async () => ({ choices: [{ message: { content: [{ type: "text", text: "  safe answer  " }] } }] }) };
  });
  assert.equal(output, "safe answer");
  assert.equal(request.url, "https://gateway.example/v1/chat/completions");
  assert.equal(JSON.parse(request.options.body).max_tokens, 800);
  assert.equal(request.options.headers.Authorization, "Bearer secret");
});

test("provider errors and malformed responses safely return null", async () => {
  const env = { ZORD_AI_API_KEY: "secret", ZORD_AI_MODEL: "test-model" };
  assert.equal(await completeChat("system", "user", 100, env, async () => ({ ok: false })), null);
  assert.equal(await completeChat("system", "user", 100, env, async () => ({ ok: true, json: async () => ({ choices: [] }) })), null);
});

test("classification parser accepts JSON fences and rejects malformed or unsafe shapes", () => {
  assert.deepEqual(parsePolyShieldClassification('```json\n{"flagged":true,"severity":"high","reason":"targeted harassment"}\n```'), {
    flagged: true, severity: "high", reason: "targeted_harassment",
  });
  assert.equal(parsePolyShieldClassification("not json"), null);
  assert.equal(parsePolyShieldClassification('{"flagged":"yes"}'), null);
});

test("AI false negatives cannot erase deterministic local abuse findings", () => {
  assert.deepEqual(mergePolyShieldFinding(
    { flagged: true, severity: "medium", reason: "keyword_fallback" },
    { flagged: false, severity: "low", reason: "none" },
  ), { flagged: true, severity: "medium", reason: "keyword_fallback" });
});

test("AI can add multilingual findings and only raise local severity", () => {
  assert.deepEqual(mergePolyShieldFinding(
    { flagged: false },
    { flagged: true, severity: "high", reason: "threat" },
  ), { flagged: true, severity: "high", reason: "threat" });
  assert.deepEqual(mergePolyShieldFinding(
    { flagged: true, severity: "medium", reason: "keyword_fallback" },
    { flagged: true, severity: "high", reason: "model_reason" },
  ), { flagged: true, severity: "high", reason: "keyword_fallback" });
});
