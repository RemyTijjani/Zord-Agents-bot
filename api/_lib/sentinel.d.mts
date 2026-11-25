export type SentinelFinding = { reason: string; severity: "medium" | "high" };
export function detectSentinelThreat(input: unknown): SentinelFinding | null;
