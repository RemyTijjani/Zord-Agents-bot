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
