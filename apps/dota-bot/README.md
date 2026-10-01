# Dota.Opinia Telegram bot

The bot is a private-chat client for the existing Dota profile, LFG, party, and invite APIs. It automatically matches solo searchers with compatible open parties and does not store Dota profile data. Account sessions and guest recovery URLs in its SQLite database are encrypted with Fernet.

## Run with Docker Compose

1. Create a Telegram bot with `@BotFather` and set `DOTA_BOT_TOKEN`.
2. Generate two independent secrets:

   ```powershell
   python -c "import secrets; print(secrets.token_urlsafe(48))"
   python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
   ```

   Put the first value in `TELEGRAM_BOT_API_SECRET` and the second in `DOTA_BOT_ENCRYPTION_KEY`. Use the same API secret for the API and the bot.
3. Set `DOTA_BOT_SITE_URL` to the public Dota.Opinia site URL. The internal API URL defaults to `http://api:3000` inside Compose.
4. Optional: set `DOTA_BOT_ADMIN_IDS` to a comma-separated allowlist of numeric Telegram user IDs. Administrators can use `/admin` to preview and send announcements; `/news` lets users control announcement delivery. Username-based admin checks are not used.
5. Start the bot:

   ```powershell
   docker compose --profile dota-bot up -d --build dota-bot
   ```

The API migration is applied by the normal production API startup command. For development, run the repository database migration command before starting the bot.

## Account linking

An existing user opens **Profile → Account settings → Telegram bot → Link Telegram** on the website, then sends `/link CODE` to this bot within ten minutes. The bot never asks for website passwords. New users can create a guest profile in the bot; its recovery URL is encrypted in bot storage and can be shown from the account panel.

## Runtime state

The bot uses long polling and has no inbound port. `/data/dota_bot.db` stores encrypted auth/recovery secrets, the editable panel message ID, UI selections, automatic-match exclusions, delivered notification IDs, and temporary message deletion deadlines. Solo matching checks the shared LFG list every 15 seconds and joins a compatible `OPEN` party on a free profile role. Starting recruitment marks every unoccupied party role as open; role assignment is randomized among the seeker's matching profile roles. API-side party notifications use a durable PostgreSQL outbox with bounded exponential retries.

## Acquisition links

Create a short lowercase campaign code for each placement, for example `https://t.me/FDPdotabot?start=src_telegram_group_01`, `https://t.me/FDPdotabot?start=src_tiktok_clip_01`, or `https://t.me/FDPdotabot?start=src_streamer_creator_01`. Supported source prefixes include `seo`, `community`, `telegram`, `discord`, `vk`, `tiktok`, `youtube`, `twitch`, `steam`, `search`, `referral`, `streamer`, and `site`. Keep codes anonymous and within Telegram's 64-character start-payload limit. Party invitations keep their separate `party_<code>` payload.

The FDP website preserves the first UTM/referrer attribution for 30 days and appends the channel and campaign to the Telegram start link. The web admin analytics records tagged FDP landing visits and bot-button clicks per channel. The bot's `/admin` panel reports unique first-touch starts, account setup, searches, entries into parties, and separately created parties by campaign; it also shows repeated searches, party entries, creations, and average elapsed search time for the last 30 days. Users who started before source tracking remain grouped under “До меток”. Historic party milestones included party creation, so those old counts cannot be split retroactively.

See [`docs/marketing/fdp-growth-90-day-execution.md`](../../docs/marketing/fdp-growth-90-day-execution.md) for the campaign-code register, UTM conventions, pilot schedule, budgets, and consent-first outreach templates.
