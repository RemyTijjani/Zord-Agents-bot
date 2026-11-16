# ZORD Agents Bot

A standalone Telegram bot platform containing three independently gated agent modules:

- **Sentinel** — community protection and spam/suspicious-link detection.
- **Poly-Shield** — multilingual moderation and contextual risk assessment.
- **Omini Glitch** — community intelligence, reporting, and content assistance.

The bot is developed as a separate project from the QUANTUM-AI / ZORD application. The future ZORD marketplace is intended to sell access to individual agent modules; marketplace payments and rental entitlements are not part of this initial bot foundation.

## Project status

This repository currently contains the initial admin dashboard, Supabase schema, and Telegram webhook foundation. Agent execution, robust webhook retry handling, Telegram community ownership verification, and automated tests remain to be implemented.

## Local setup

1. Install Node.js (LTS).
2. Run `npm ci`.
3. Copy the required public Supabase project URL and anon key into a local `.env` file using the Vite environment variable names expected by `src/lib/supabase.ts`.
4. Configure the Telegram bot token and webhook secret as server-side Supabase Function secrets. Never put these values in the Vite client or commit them.
5. Run `npm run dev`.

## Security

- Never commit `.env`, bot tokens, service-role keys, or other credentials.
- Telegram webhook authentication must use the secret-token header.
- Community membership alone does not grant a customer access to a rented agent.
- Do not enable live rentals or agent actions until entitlement checks and ownership/association verification are implemented.

## Development boundaries

This repository is independent. Do not connect it to or modify the existing QUANTUM-AI / ZORD production application or database as part of standalone bot development.
