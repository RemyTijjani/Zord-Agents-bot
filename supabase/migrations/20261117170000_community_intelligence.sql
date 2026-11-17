-- Community Intelligence: isolated context profiles for each Telegram group/channel.
CREATE TABLE IF NOT EXISTS public.community_intelligence_profiles (
  telegram_chat_id bigint PRIMARY KEY REFERENCES public.telegram_communities(telegram_chat_id) ON DELETE CASCADE,
  community_name text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  topic text NOT NULL DEFAULT '',
  audience text NOT NULL DEFAULT '',
  focus_topics text[] NOT NULL DEFAULT '{}',
  rules text NOT NULL DEFAULT '',
  tone text NOT NULL DEFAULT 'helpful, respectful and clear',
  content_preferences text NOT NULL DEFAULT '',
  profile_source text NOT NULL DEFAULT 'owner_or_telegram_metadata',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS community_intelligence_profiles_updated_idx
  ON public.community_intelligence_profiles (updated_at DESC);
REVOKE ALL ON public.community_intelligence_profiles FROM PUBLIC;
