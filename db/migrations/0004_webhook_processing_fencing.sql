-- Fence webhook workers so a reclaimed update cannot be finalized by an older worker.
-- Existing update history is preserved; active claims start NULL and are reclaimed by
-- the existing stale-processing lease rule when appropriate.
ALTER TABLE public.telegram_updates
  ADD COLUMN IF NOT EXISTS processing_token text;

