-- Persist short AI request windows per community, actor and module.
-- A single row per actor/module is rotated each minute to keep storage bounded.
CREATE TABLE IF NOT EXISTS public.agent_ai_usage_windows (
  telegram_chat_id bigint NOT NULL,
  actor_key text NOT NULL,
  module_key text NOT NULL CHECK (module_key IN ('poly_shield', 'omini_glitch')),
  window_started_at timestamptz NOT NULL,
  request_count integer NOT NULL DEFAULT 1 CHECK (request_count > 0),
  PRIMARY KEY (telegram_chat_id, actor_key, module_key)
);
