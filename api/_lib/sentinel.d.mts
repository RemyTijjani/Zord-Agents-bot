export type SentinelFinding = { reason: string; severity: "medium" | "high" };
export function detectSentinelThreat(input: unknown, profile?: { community_name?: string } | null): SentinelFinding | null;
