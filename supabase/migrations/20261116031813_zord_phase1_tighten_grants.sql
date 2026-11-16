/*
# Tighten Phase 1 access grants

Plain-English summary: the new tables were created with broad default permissions that let anonymous visitors and signed-in users write to them. This migration removes those permissions. Only signed-in users can read, and only the rows their access rules allow. Nobody can write to these tables through the public interface; the server-side Telegram webhook keeps its own write access.

## 1. Security changes
- Revoke all table permissions from the anonymous role on user_roles, telegram_communities and telegram_updates.
- Revoke insert, update, delete and truncate from the signed-in role on all three tables.
- Keep read-only (SELECT) permission for the signed-in role; row rules still limit what each user sees.
- The admin check helper now runs with the caller's own rights instead of elevated rights. It only inspects the caller's own role row, which the existing policy already permits.

## 2. Notes
1. Re-running this migration is safe; revokes and replaces are idempotent.
2. Server-side write access (service role) is unchanged.
*/

REVOKE ALL ON user_roles, telegram_communities, telegram_updates FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON user_roles, telegram_communities, telegram_updates FROM authenticated;
GRANT SELECT ON user_roles, telegram_communities, telegram_updates TO authenticated;

CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  );
$$;

REVOKE EXECUTE ON FUNCTION is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION is_admin() TO authenticated;
