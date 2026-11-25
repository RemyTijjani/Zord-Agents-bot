import test from "node:test";
import assert from "node:assert/strict";
import {
  isTelegramCommunityAdmin,
  resolveAgentEnableDecision,
  updateSelectedModules,
} from "../api/_lib/agent-controls.mjs";

test("only Telegram creators and administrators can manage community agents", () => {
  assert.equal(isTelegramCommunityAdmin({ status: "creator" }), true);
  assert.equal(isTelegramCommunityAdmin({ status: "administrator" }), true);
  assert.equal(isTelegramCommunityAdmin({ status: "member" }), false);
  assert.equal(isTelegramCommunityAdmin(null), false);
});

test("module selection adds and removes only known modules without duplicates", () => {
  assert.deepEqual(updateSelectedModules(["sentinel", "sentinel", "unknown"], "poly_shield", true), ["sentinel", "poly_shield"]);
  assert.deepEqual(updateSelectedModules(["sentinel", "poly_shield"], "sentinel", false), ["poly_shield"]);
});

test("global availability and bot permissions gate free agents", () => {
  const permissions = { is_admin: true, can_delete_messages: true, can_send_messages: true };
  assert.deepEqual(resolveAgentEnableDecision({ moduleKey: "sentinel", globallyAvailable: false, chatType: "supergroup", botPermissions: permissions }), { allowed: false, reason: "globally_unavailable" });
  assert.equal(resolveAgentEnableDecision({ moduleKey: "sentinel", globallyAvailable: true, chatType: "supergroup", botPermissions: permissions }).allowed, true);
  assert.deepEqual(resolveAgentEnableDecision({ moduleKey: "sentinel", globallyAvailable: true, chatType: "supergroup", botPermissions: { is_admin: true, can_delete_messages: false, can_send_messages: true } }), { allowed: false, reason: "missing_bot_permission" });
});

test("Omini Glitch requires a verified active rental for the same community", () => {
  const permissions = { is_admin: true, can_send_messages: true };
  assert.deepEqual(resolveAgentEnableDecision({ moduleKey: "omini_glitch", globallyAvailable: true, chatType: "supergroup", botPermissions: permissions, hasEntitlement: false }), { allowed: false, reason: "active_community_rental_required" });
  assert.equal(resolveAgentEnableDecision({ moduleKey: "omini_glitch", globallyAvailable: true, chatType: "supergroup", botPermissions: permissions, hasEntitlement: true }).allowed, true);
});

test("unknown modules cannot be enabled", () => {
  assert.deepEqual(resolveAgentEnableDecision({ moduleKey: "admin", globallyAvailable: true, chatType: "supergroup", botPermissions: { is_admin: true, can_send_messages: true } }), { allowed: false, reason: "unknown_module" });
});
