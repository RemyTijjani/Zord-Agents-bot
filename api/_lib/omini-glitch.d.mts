export type OminiGenerationResult = {
  action: string;
  severity: "low" | "info";
  response: string;
};
export function resolveOminiGeneration(command: string, output: unknown): OminiGenerationResult;
export function formatCommunityReport(rows: unknown): string;
