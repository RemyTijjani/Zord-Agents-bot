/*
# Reliable Telegram update processing and community removal tracking

Adds a lease-based update claim so Telegram retries can safely re-enter failed
or abandoned webhook work without processing the same update concurrently.
Also records when the bot is removed from a community.
*/

ALTER TABLE telegram_updates
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS processing_started_at timestamptz;

ALTER TABLE telegram_communities
  DROP CONSTRAINT IF EXISTS telegram_communities_status_check;

ALTER TABLE telegram_communities
  ADD CONSTRAINT telegram_communities_status_check
  CHECK (status IN ('pending', 'active', 'suspended', 'removed'));

CREATE OR REPLACE FUNCTION claim_telegram_update(
  p_update_id bigint,
  p_update_type text,
  p_chat_id bigint
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  was_claimed boolean := false;
BEGIN
  INSERT INTO telegram_updates (
    update_id,
    update_type,
    chat_id,
    status,
    attempt_count,
    processing_started_at,
    error,
    processed_at
  )
  VALUES (
    p_update_id,
    p_update_type,
    p_chat_id,
    'received',
    1,
    now(),
    NULL,
    NULL
  )
  ON CONFLICT (update_id) DO UPDATE
  SET
    update_type = EXCLUDED.update_type,
    chat_id = EXCLUDED.chat_id,
    status = 'received',
    attempt_count = telegram_updates.attempt_count + 1,
    processing_started_at = now(),
    error = NULL,
    processed_at = NULL
  WHERE telegram_updates.status <> 'processed'
    AND (
      telegram_updates.status = 'failed'
      OR telegram_updates.processing_started_at IS NULL
      OR telegram_updates.processing_started_at < now() - interval '5 minutes'
    )
  RETURNING true INTO was_claimed;

  RETURN COALESCE(was_claimed, false);
END;
$$;

REVOKE ALL ON FUNCTION claim_telegram_update(bigint, text, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION claim_telegram_update(bigint, text, bigint) TO service_role;
