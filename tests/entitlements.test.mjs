import test from "node:test";
import assert from "node:assert/strict";
import { resolveActiveModules } from "../api/_lib/entitlements.mjs";

const now = Date.parse("2026-11-25T12:00:00.000Z");
const activeForA = {
  telegram_chat_id: "-1001111111111",
  module_key: "omini_glitch",
  status: "active",
  starts_at: "2026-11-25T11:00:00.000Z",
  expires_at: "2026-11-26T11:00:00.000Z",
};

function resolve(communityId, entitlements = [activeForA]) {
  return resolveActiveModules({
    communityId,
    selectedModules: ["sentinel", "poly_shield", "omini_glitch"],
    availableModules: ["sentinel", "poly_shield", "omini_glitch"],
    entitlements,
    now,
  });
}

test("paid Omini Glitch entitlement unlocks only its bound community", () => {
  assert.deepEqual(resolve("-1001111111111"), ["sentinel", "poly_shield", "omini_glitch"]);
  assert.deepEqual(resolve("-1002222222222"), ["sentinel", "poly_shield"]);
});

test("free agents remain available without a paid entitlement", () => {
  assert.deepEqual(resolve("-1001111111111", []), ["sentinel", "poly_shield"]);
});

test("expired and not-yet-started rentals do not unlock Omini Glitch", () => {
  const expired = { ...activeForA, expires_at: "2026-11-25T11:59:59.000Z" };
  const future = { ...activeForA, starts_at: "2026-11-25T12:00:01.000Z" };
  assert.deepEqual(resolve("-1001111111111", [expired]), ["sentinel", "poly_shield"]);
  assert.deepEqual(resolve("-1001111111111", [future]), ["sentinel", "poly_shield"]);
});

test("unavailable modules cannot be enabled by a rental", () => {
  const result = resolveActiveModules({
    communityId: "-1001111111111",
    selectedModules: ["sentinel", "omini_glitch"],
    availableModules: ["sentinel"],
    entitlements: [activeForA],
    now,
  });
  assert.deepEqual(result, ["sentinel"]);
});
