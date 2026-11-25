import test from "node:test";
import assert from "node:assert/strict";
import { formatCommunityReport, resolveOminiGeneration } from "../api/_lib/omini-glitch.mjs";

test("Omini Glitch does not record unavailable AI generation as completed content", () => {
  assert.deepEqual(resolveOminiGeneration("meme", null), {
    action: "content_generation_unavailable",
    severity: "low",
    response: "Omini Glitch content assistance needs the ZORD AI service to be configured.",
  });
});

test("successful Omini Glitch content records the correct action", () => {
  assert.deepEqual(resolveOminiGeneration("meme", "  A community-specific meme  "), {
    action: "meme_created",
    severity: "info",
    response: "A community-specific meme",
  });
  assert.equal(resolveOminiGeneration("glitch", "Draft post").action, "community_content_created");
});

test("weekly report handles an empty activity set", () => {
  assert.equal(formatCommunityReport([]), "No recorded agent actions in the last 7 days.");
  assert.equal(formatCommunityReport(null), "No recorded agent actions in the last 7 days.");
});

test("weekly report is capped and sanitizes labels", () => {
  const rows = Array.from({ length: 15 }, (_, index) => ({
    module_key: index === 0 ? "sentinel\nInjected line" : "poly_shield",
    action_key: "action_" + index,
    total: index + 1,
  }));
  const report = formatCommunityReport(rows);
  assert.equal(report.split("\n").length, 12);
  assert.match(report, /^• sentinel Injected line: action_0 — 1/);
  assert.doesNotMatch(report, /Injected line\n/);
});
