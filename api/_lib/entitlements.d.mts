export type EntitlementRow = {
  telegram_chat_id: string | number;
  telegram_user_id: string | number;
  module_key: string;
  status: string;
  starts_at: string | Date | null;
  expires_at: string | Date | null;
};
export function resolveActiveModules(input: {
  communityId: string | number;
  ownerId: string | number;
  selectedModules: string[];
  availableModules: string[];
  entitlements: EntitlementRow[];
  now?: number;
}): ("sentinel" | "poly_shield" | "omini_glitch")[];
