/*
# ZORD Phase 1: roles, Telegram communities and update log

Plain-English summary: sets up the foundation for the ZORD admin dashboard and the Telegram bot. Admins are identified by a role table. Telegram groups the bot is added to are recorded as communities. Every incoming Telegram update is logged once so repeated deliveries are ignored.

## 1. New tables
- `user_roles`: which signed-in users are administrators. Columns: id, user_id (links to the account), role (currently only 'admin'), created_at. One role per user per type.
- `telegram_communities`: Telegram groups, supergroups and channels the bot has been added to. Columns: id, telegram_chat_id (unique Telegram ID), title, chat_type, owner_user_id (nullable until ownership is verified), status ('pending', 'active', 'suspended'), added_at, updated_at, last_seen_at.
- `telegram_updates`: log of Telegram webhook updates. The Telegram update_id is the primary key, so a duplicate delivery cannot be inserted twice. Columns: update_id, update_type, chat_id, status ('received', 'processed', 'failed'), error, received_at, processed_at.

## 2. Security
- Row level security is enabled on all three tables.
- A helper function `is_admin()` checks whether the signed-in user holds the admin role. It is callable by signed-in users only.
- `user_roles`: a user can read only their own role rows. Nobody can write through the Data API; roles are granted by the project owner.
- `telegram_communities` and `telegram_updates`: only administrators can read them. Writes happen exclusively from the server-side Telegram webhook using the service role.
- No anonymous (anon) access is granted on any table.

## 3. Notes
1. Community ownership and customer-facing access will be added in a later phase.
2. Tables are created with IF NOT EXISTS so the migration is safe to re-run.
*/

CREATE TABLE IF NOT EXISTS user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('admin')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

CREATE TABLE IF NOT EXISTS telegram_communities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_chat_id bigint NOT NULL UNIQUE,
  title text NOT NULL DEFAULT '',
  chat_type text NOT NULL,
  owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'suspended')),
  added_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz
);

CREATE INDEX IF NOT EXISTS telegram_communities_owner_idx ON telegram_communities (owner_user_id);
CREATE INDEX IF NOT EXISTS telegram_communities_status_idx ON telegram_communities (status);

CREATE TABLE IF NOT EXISTS telegram_updates (
  update_id bigint PRIMARY KEY,
  update_type text NOT NULL DEFAULT 'unknown',
  chat_id bigint,
  status text NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'processed', 'failed')),
  error text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

CREATE INDEX IF NOT EXISTS telegram_updates_received_idx ON telegram_updates (received_at DESC);

CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  );
$$;

REVOKE EXECUTE ON FUNCTION is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION is_admin() TO authenticated;

ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE telegram_communities ENABLE ROW LEVEL SECURITY;
ALTER TABLE telegram_updates ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON user_roles TO authenticated;
GRANT SELECT ON telegram_communities TO authenticated;
GRANT SELECT ON telegram_updates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON user_roles, telegram_communities, telegram_updates TO service_role;

DROP POLICY IF EXISTS "Users can read own roles" ON user_roles;
CREATE POLICY "Users can read own roles"
ON user_roles FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can read communities" ON telegram_communities;
CREATE POLICY "Admins can read communities"
ON telegram_communities FOR SELECT
TO authenticated
USING (is_admin());

DROP POLICY IF EXISTS "Admins can read telegram updates" ON telegram_updates;
CREATE POLICY "Admins can read telegram updates"
ON telegram_updates FOR SELECT
TO authenticated
USING (is_admin());
