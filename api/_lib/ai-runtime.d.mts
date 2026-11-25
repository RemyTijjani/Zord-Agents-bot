export interface AiConfig {
  apiKey: string;
  model: string;
  endpoint: string;
}

export interface PolyShieldFinding {
  flagged: boolean;
  severity: "low" | "medium" | "high";
  reason: string;
}

export function getAiConfig(env?: Record<string, string | undefined>): AiConfig | null;
export function completeChat(
  system: string,
  user: string,
  maxTokens?: number,
  env?: Record<string, string | undefined>,
  fetchImpl?: typeof fetch,
): Promise<string | null>;
export function parsePolyShieldClassification(raw: string | null): PolyShieldFinding | null;
export function mergePolyShieldFinding(
  fallback: Partial<PolyShieldFinding> | null,
  modelFinding: PolyShieldFinding | null,
): PolyShieldFinding;
