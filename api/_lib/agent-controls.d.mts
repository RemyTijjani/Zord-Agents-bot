export type AgentModuleKey = "sentinel" | "poly_shield" | "omini_glitch";
export function isTelegramCommunityAdmin(member: { status?: string } | null | undefined): boolean;
export function updateSelectedModules(current: unknown, moduleKey: string, enabled: boolean): AgentModuleKey[];
export function resolveAgentEnableDecision(input: {
  moduleKey: string;
  globallyAvailable: boolean;
  chatType: string;
  botPermissions: unknown;
  hasEntitlement?: boolean;
}): { allowed: boolean; reason: string };
