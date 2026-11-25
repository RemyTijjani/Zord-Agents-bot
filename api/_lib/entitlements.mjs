const ALLOWED_MODULES = new Set(["sentinel", "poly_shield", "omini_glitch"]);
const FREE_MODULES = new Set(["sentinel", "poly_shield"]);

export function resolveActiveModules({ communityId, selectedModules, availableModules, entitlements, now = Date.now() }) {
  const selected = new Set((selectedModules ?? []).filter((key) => ALLOWED_MODULES.has(key)));
  const available = new Set((availableModules ?? []).filter((key) => ALLOWED_MODULES.has(key)));
  const hasPaidCommunityEntitlement = (entitlements ?? []).some((entitlement) => {
    if (entitlement.module_key !== "omini_glitch" || entitlement.status !== "active") return false;
    if (String(entitlement.telegram_chat_id) !== String(communityId)) return false;
    const startsAt = entitlement.starts_at == null ? null : Date.parse(entitlement.starts_at);
    const expiresAt = entitlement.expires_at == null ? null : Date.parse(entitlement.expires_at);
    return (startsAt === null || (Number.isFinite(startsAt) && startsAt <= now))
      && (expiresAt === null || (Number.isFinite(expiresAt) && expiresAt > now));
  });

  return [...selected].filter((key) => available.has(key)
    && (FREE_MODULES.has(key) || (key === "omini_glitch" && hasPaidCommunityEntitlement)));
}
