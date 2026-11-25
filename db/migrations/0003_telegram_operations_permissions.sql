-- Stage 7: persist the bot's Telegram capabilities per community.
-- Existing community records are preserved and receive an empty capability snapshot
-- until Telegram sends a fresh my_chat_member update.
ALTER TABLE public.telegram_communities
  ADD COLUMN IF NOT EXISTS bot_permissions jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Support efficient recovery of stale webhook processing leases.
CREATE INDEX IF NOT EXISTS telegram_updates_processing_lease_idx
  ON public.telegram_updates (status, processing_started_at)
  WHERE status IN ('received', 'processing', 'failed');
