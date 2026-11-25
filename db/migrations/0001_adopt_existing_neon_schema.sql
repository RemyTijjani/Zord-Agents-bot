-- Neon adoption baseline for the existing zord_agents_bot database.
-- The nine existing public tables were inspected and adopted in place.
-- This migration intentionally does not recreate, drop, truncate, or rewrite them.
-- Future schema changes are tracked in public.schema_migrations by scripts/migrate.mjs.
SELECT 1;
