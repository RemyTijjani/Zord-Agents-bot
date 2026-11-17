-- Official ZORD agent runtime: per-community switches and auditable moderation actions.
CREATE TABLE IF NOT EXISTS public.community_agent_settings (
  telegram_chat_id bigint PRIMARY KEY REFERENCES public.telegram_communities(telegram_chat_id) ON DELETE CASCADE,
  enabled_modules text[] NOT NULL DEFAULT '{}',
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by_telegram_user_id bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT community_agent_settings_modules_check
    CHECK (enabled_modules <@ ARRAY['sentinel','poly_shield','omini_glitch']::text[])
);

CREATE INDEX IF NOT EXISTS community_agent_settings_modules_gin
  ON public.community_agent_settings USING gin (enabled_modules);

CREATE TABLE IF NOT EXISTS public.agent_action_logs (
  id bigserial PRIMARY KEY,
  telegram_chat_id bigint NOT NULL,
  telegram_user_id bigint,
  module_key text NOT NULL CHECK (module_key IN ('sentinel','poly_shield','omini_glitch')),
  action_key text NOT NULL,
  severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info','low','medium','high')),
  message_fingerprint text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agent_action_logs_chat_created_idx
  ON public.agent_action_logs (telegram_chat_id, created_at DESC);
CREATE INDEX IF NOT EXISTS agent_action_logs_module_created_idx
  ON public.agent_action_logs (module_key, created_at DESC);

-- Keep the official modules unavailable globally until their controls and runtime are verified.
UPDATE public.agent_modules
SET description = CASE module_key
  WHEN 'sentinel' THEN 'Spam, scam and suspicious-link protection'
  WHEN 'poly_shield' THEN 'Multilingual moderation and community Q&A'
  WHEN 'omini_glitch' THEN 'Advanced community intelligence and content assistance'
  ELSE description
END,
updated_at = now();

REVOKE ALL ON public.community_agent_settings, public.agent_action_logs FROM PUBLIC;
