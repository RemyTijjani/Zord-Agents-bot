import { canRunTelegramModule } from "./telegram-operations.mjs";

const allowedModules = new Set(["sentinel", "poly_shield", "omini_glitch"]);

export function isTelegramCommunityAdmin(member) {
  return member?.status === "creator" || member?.status === "administrator";
}

export function updateSelectedModules(current, moduleKey, enabled) {
  if (!allowedModules.has(moduleKey)) return Array.isArray(current) ? current.filter((key) => allowedModules.has(key)) : [];
  const selected = new Set(Array.isArray(current) ? current.filter((key) => allowedModules.has(key)) : []);
  if (enabled) selected.add(moduleKey);
  else selected.delete(moduleKey);
  return [...selected];
}

export function resolveAgentEnableDecision(input) {
  const moduleKey = input?.moduleKey;
  if (!allowedModules.has(moduleKey)) return { allowed: false, reason: "unknown_module" };
  if (input?.globallyAvailable !== true) return { allowed: false, reason: "globally_unavailable" };
  if (!canRunTelegramModule(moduleKey, input?.chatType, input?.botPermissions)) {
    return { allowed: false, reason: "missing_bot_permission" };
  }
  if (moduleKey === "omini_glitch" && input?.hasEntitlement !== true) {
    return { allowed: false, reason: "active_community_rental_required" };
  }
  return { allowed: true, reason: "allowed" };
}
