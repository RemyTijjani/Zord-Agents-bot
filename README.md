# ZORD Agents Bot

A standalone Telegram bot platform containing three independently gated agent modules:

- **Sentinel** — community protection and spam/suspicious-link detection.
- **Poly-Shield** — multilingual moderation and contextual risk assessment.
- **Omini Glitch** — community intelligence, reporting, and content assistance.

This repository is independent from the QUANTUM-AI / ZORD application. The ZORD marketplace will handle rentals and payments; this bot performs the actual work inside customer Telegram groups and channels.

## Current foundation

- Neon PostgreSQL database for bot administration and community data.
- Telegram OpenID Connect administrator login with PKCE, state and nonce validation.
- Signed, HTTP-only admin session cookies.
- Admin access restricted to Telegram account ID `1704977260`, which must also be active in the Neon `admins` table.
- Protected Vercel API routes for dashboard data.
- Secret-authenticated Telegram webhook for bot membership changes.
- Community records are marked active only after Telegram confirms the bot is an administrator with message-deletion permission and the chat creator can be identified. Otherwise, the community remains restricted.
- Sentinel, Poly-Shield and Omini Glitch are seeded but disabled until their execution modules and marketplace entitlement verification are implemented.

## Required environment variables

Configure these in the dedicated `zord-agents-bot` Vercel project. Never expose them with a `VITE_` prefix.

- `DATABASE_URL` — connection string for the `zord_agents_bot` database in the bot's Neon project.
- `AUTH_COOKIE_SECRET` — random secret of at least 32 bytes, used to sign short-lived login state and admin sessions.
- `APP_BASE_URL` — canonical HTTPS application origin, for example `https://zord-agents-bot.vercel.app`.
- `TELEGRAM_LOGIN_CLIENT_ID` — Client ID from Telegram's OpenID Connect settings in @BotFather.
- `TELEGRAM_LOGIN_CLIENT_SECRET` — matching Client Secret from @BotFather.
- `TELEGRAM_ADMIN_ID` — must be set to `1704977260`.
- `TELEGRAM_BOT_TOKEN` — bot token from @BotFather. Keep it server-side and never commit or share it.
- `TELEGRAM_WEBHOOK_SECRET` — secret used to authenticate Telegram webhook deliveries. This is stored as a sensitive Production variable in Vercel.
- `ZORD_MARKETPLACE_WEBHOOK_SECRET` — shared server-to-server HMAC secret for signed rental entitlement sync and checks. Configure the same value only in this bot project and the trusted ZORD marketplace backend; never expose it to browser code.

In @BotFather, configure the allowed website origin and callback URL:
`https://zord-agents-bot-remytijjanis-projects.vercel.app`
`https://zord-agents-bot-remytijjanis-projects.vercel.app/api/auth/telegram/callback`

The actual production hostname must match `APP_BASE_URL` and the URLs registered with @BotFather.

After `TELEGRAM_BOT_TOKEN` is configured, sign in to the admin dashboard and use **Connect Telegram bot** on the Overview page. This registers the webhook at `/api/telegram/webhook` using Telegram's secret-token header.

## Local setup

1. Install Node.js 20 or later.
2. Run `npm ci`.
3. Configure the server-only variables above in a local `.env` file (never commit it).
4. Run `npm run dev` for the Vite interface. For local API testing, use Vercel's local development runtime so the `api/` functions are available.

## Security boundaries

- Never commit `.env`, Telegram bot tokens, Telegram Login client secrets, database credentials, or session secrets.
- Telegram ID tokens are verified server-side against Telegram's published JWKS, issuer, audience, expiry, issue time and nonce.
- The admin session is signed, HTTP-only, SameSite=Lax, Secure in production, and expires after eight hours.
- Each protected dashboard API request checks the signed session and the active admin record in Neon.
- Telegram webhook requests are checked against the configured webhook secret before processing.
- Telegram update IDs are recorded idempotently; message contents are not stored by the initial connection handler.
- Community membership alone does not grant a customer access to a rented agent.
- Do not enable live rentals or agent actions until marketplace entitlement checks and module-specific permission checks are implemented.

## Development boundaries

Do not connect this repository to or modify the existing QUANTUM-AI / ZORD production application or database as part of standalone bot development.

## Marketplace entitlement integration

The bot exposes `POST /api/integrations/entitlements` for server-to-server rental synchronization and community entitlement checks. It is intentionally unavailable until `ZORD_MARKETPLACE_WEBHOOK_SECRET` is configured.

Every request must include:
- `X-Zord-Timestamp`: Unix timestamp in seconds (requests older than five minutes are rejected).
- `X-Zord-Signature`: lowercase hex HMAC-SHA256 of `<timestamp>.<JSON.stringify(requestBody)>`, using the shared secret.

Sign the exact compact JSON body sent over HTTP; preserve property order between signing and sending. Do not sign a separately formatted or re-serialized body.

### Sync a rental

Send a signed JSON body with `action: "sync"` and these fields:
`external_entitlement_id`, `telegram_user_id`, `module_key` (`omini_glitch` only), `status` (`pending`, `active`, `suspended`, `revoked`, or `expired`), optional `telegram_chat_id`, optional `starts_at`, optional `expires_at`, and optional object `entitlement_data`. Pending orders may omit `telegram_chat_id` while the customer is adding the bot. An `active` rental must include a verified `telegram_chat_id` owned by the same Telegram user. Each external entitlement ID is permanently bound to one community.

Only the trusted marketplace backend should send `status: "active"`, and only after it has verified the rental/payment. Repeated syncs update the same record using `external_entitlement_id`.

### Check a community

Send a signed body `{"action":"check","telegram_chat_id":"-100..."}`. The bot resolves the community owner from its own verified Neon record; callers cannot choose the owner ID. Free Sentinel and Poly-Shield availability is independent. Omini Glitch is returned only when an unexpired active entitlement is bound to that exact Telegram community and owner. An unverified/restricted community receives no active modules.

The three modules remain globally disabled until their execution handlers, moderation permissions, and operational safeguards have been implemented and tested. An active rental alone does not switch a module on.


## Official agent runtime

The central webhook accepts Telegram `my_chat_member`, `chat_member`, `message`, `edited_message`, `channel_post`, and `edited_channel_post` updates. It verifies community ownership, refreshes permissions on ownership changes, and routes eligible content through the independent modules.

- **Sentinel:** checks message text for high-confidence scam patterns and excessive links. It deletes only high-confidence matches (and only when Telegram grants delete permission); detections and actions are logged without storing raw message text.
- **Poly-Shield:** applies a conservative local toxicity fallback and, when an AI provider is configured, multilingual classification. `/ask <question>` provides multilingual community Q&A. Flagged messages are sent for moderator review; Poly-Shield does not automatically delete them.
- **Omini Glitch:** `/ominireport` returns a seven-day action summary; `/glitch <idea>` drafts a community post; `/meme <topic>` creates a text-only meme caption.

### AI provider configuration

Set these server-side variables in the dedicated bot project when enabling AI-powered Poly-Shield and Omini Glitch features:

- `ZORD_AI_API_KEY` — API key for an OpenAI-compatible chat-completions provider.
- `ZORD_AI_MODEL` — model identifier supported by that provider.
- `ZORD_AI_API_URL` — optional full chat-completions URL; defaults to `https://api.openai.com/v1/chat/completions`.

The AI key is never exposed to browser code. Without these values, the deterministic Sentinel checks and local Poly-Shield fallback remain available; AI Q&A/content generation returns a configuration message.

### Per-community controls and test safety

The administrator's Communities page now has independent Sentinel, Poly-Shield, and Omini Glitch switches for each verified community. Settings are saved server-side and recorded in the audit log.

- Normal operation requires a verified community, a module selected for that community, global module availability, and a current active rental entitlement for the verified community owner.
- There is no test-mode or rental-bypass switch. Paid Omini Glitch access is always bound to the exact verified Telegram community and its current owner.
- Global module availability remains off by default. Do not enable public rentals until live-group tests and the AI provider configuration are complete.
- Module execution is gated by the bot's current Telegram permissions: Sentinel requires delete-message permission; Poly-Shield and Omini Glitch require permission to send messages (including channel post permission for channels).
- Edited messages and channel posts are rechecked. Webhook update processing uses a five-minute processing lease to reduce duplicate concurrent work.
- Ordinary member updates are not catalogued or stored as member profiles; `chat_member` is used only to refresh verified community ownership when a creator transition occurs.

The Neon schema is managed only through `db/migrations/`. Run `npm run migrate` with the bot's `DATABASE_URL` to apply pending, checksum-verified migrations. Do not use Supabase CLI or Supabase migrations for this project.


## Community Intelligence

Every Telegram group or channel has an isolated `community_intelligence_profiles` record. The shared profile powers all enabled official modules without sharing context across communities.

- On bot promotion to administrator, the webhook best-effort reads the Telegram chat title and description and seeds the profile. It does not silently overwrite owner-entered profile data.
- Admin dashboard → Communities → **Configure Community Intelligence** lets the administrator set the community name, description, subject, audience, focus topics, rules, tone, and content/meme preferences.
- The verified Telegram group creator can also use `/communityprofile`, `/settopic`, `/setaudience`, `/setrules`, `/settone`, and `/setcontent` in the group.
- Poly-Shield uses the profile to frame multilingual moderation and `/ask` answers. It must acknowledge uncertainty, avoid inventing policies, and never impersonate official support or request passwords, OTPs, seed phrases, or private keys.
- Omini Glitch uses the profile for relevant community posts and memes rather than generic content.
- Sentinel's detection can use community-specific impersonation context. Normal Telegram links are not treated as shortened scam links.
- Sentinel, Poly-Shield and Omini Glitch use the same normalized, community-scoped intelligence context; Sentinel also uses the configured community name for contextual impersonation detection.
- Incoming message text is bounded before processing. Raw message text is not stored as shared memory; action logs retain fingerprints and non-content metadata.
- The profile is stored by Telegram chat ID, not globally. The runtime does not treat arbitrary member messages as verified community facts.

Community Intelligence is part of the existing Neon schema and is tracked by the Neon adoption baseline.


## Neon-only database workflow

Neon is the sole database for this repository. The previous Supabase project was not migrated and is not used by this bot. The existing Neon database is adopted in place; no existing tables or records are reset.

- SQL migrations live in `db/migrations/` and are applied in filename order.
- `public.schema_migrations` records each applied migration and its SHA-256 checksum.
- Run `npm run migrate` with `DATABASE_URL` set to the bot's Neon database.
- Applied migration files are immutable. Add a new numbered file for every schema change.
- The adoption baseline records the existing Neon schema without recreating it. The first forward migration adds community scoping to rental entitlements. Migration `0003_telegram_operations_permissions` adds the per-community Telegram permission snapshot and webhook lease index without deleting or resetting existing records.
- The CI workflow runs `npm ci`, `npm test`, and `npm run build` on pull requests and main pushes.
