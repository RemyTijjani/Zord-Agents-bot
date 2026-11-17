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
- Sentinel, Poly-Shield and Omini Glitch are seeded but disabled until their execution modules are implemented.

## Required environment variables

Configure these in the dedicated `zord-agents-bot` Vercel project. Never expose them with a `VITE_` prefix.

- `DATABASE_URL` — connection string for the `zord_agents_bot` database in the bot's Neon project.
- `AUTH_COOKIE_SECRET` — random secret of at least 32 bytes, used to sign short-lived login state and admin sessions.
- `APP_BASE_URL` — canonical HTTPS application origin, for example `https://zord-agents-bot.vercel.app`.
- `TELEGRAM_LOGIN_CLIENT_ID` — Client ID from Telegram's Login Widget / Web Login settings in @BotFather.
- `TELEGRAM_LOGIN_CLIENT_SECRET` — matching Client Secret from @BotFather.
- `TELEGRAM_ADMIN_ID` — must be set to `1704977260`.

In @BotFather, configure the allowed website origin and callback URL:
`https://zord-agents-bot.vercel.app`
`https://zord-agents-bot.vercel.app/api/auth/telegram/callback`

The actual production hostname must match `APP_BASE_URL` and the URLs registered with @BotFather.

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
- Community membership alone does not grant a customer access to a rented agent.
- Do not enable live rentals or agent actions until entitlement checks and community ownership/association verification are implemented.

## Development boundaries

Do not connect this repository to or modify the existing QUANTUM-AI / ZORD production application or database as part of standalone bot development.
