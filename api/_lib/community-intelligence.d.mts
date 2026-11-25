export type CommunityProfileInput = {
  community_name?: unknown;
  description?: unknown;
  topic?: unknown;
  audience?: unknown;
  focus_topics?: unknown;
  rules?: unknown;
  tone?: unknown;
  content_preferences?: unknown;
};

export type NormalizedCommunityProfile = {
  community_name: string;
  description: string;
  topic: string;
  audience: string;
  focus_topics: string[];
  rules: string;
  tone: string;
  content_preferences: string;
};

export function normalizeCommunityProfile(input: CommunityProfileInput, fallbackName?: string): NormalizedCommunityProfile;
export function isVerifiedCommunityOwner(
  community: { bot_status?: string; ownership_verified_at?: string | Date | null; owner_telegram_user_id?: string | number | null } | null | undefined,
  requesterId: string | number,
): boolean;
export function buildCommunityProfileContext(input: CommunityProfileInput): string;
