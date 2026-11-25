-- Bind every paid rental to the Telegram community it unlocks.
-- Nullable by design: pending marketplace orders may exist before community verification.
-- Active Omini Glitch rentals are only accepted after a verified community is attached.
ALTER TABLE public.rental_entitlements
  ADD COLUMN IF NOT EXISTS telegram_chat_id bigint;

CREATE INDEX IF NOT EXISTS rental_entitlements_community_module_status_idx
  ON public.rental_entitlements (telegram_chat_id, module_key, status);
