# Dota.Opinia Telegram bot

The bot is a private-chat client for the existing Dota profile, LFG, party, and invite APIs. It does not run matching logic or store Dota profile data. Account sessions and guest recovery URLs in its SQLite database are encrypted with Fernet.

## Run with Docker Compose

1. Create a Telegram bot with `@BotFather` and set `DOTA_BOT_TOKEN`.
2. Generate two independent secrets:

   ```powershell
   python -c "import secrets; print(secrets.token_urlsafe(48))"
   python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
   ```

   Put the first value in `TELEGRAM_BOT_API_SECRET` and the second in `DOTA_BOT_ENCRYPTION_KEY`. Use the same API secret for the API and the bot.
3. Set `DOTA_BOT_SITE_URL` to the public Dota.Opinia site URL. The internal API URL defaults to `http://api:3000` inside Compose.
4. Start the bot:

   ```powershell
   docker compose --profile dota-bot up -d --build dota-bot
   ```

The API migration is applied by the normal production API startup command. For development, run the repository database migration command before starting the bot.

## Account linking

An existing user opens **Profile → Account settings → Telegram bot → Link Telegram** on the website, then sends `/link CODE` to this bot within ten minutes. The bot never asks for website passwords. New users can create a guest profile in the bot; its recovery URL is encrypted in bot storage and can be shown from the account panel.

## Runtime state

The bot uses long polling and has no inbound port. `/data/dota_bot.db` stores encrypted auth/recovery secrets, the editable panel message ID, UI selections, automatic-match exclusions, delivered notification IDs, and temporary message deletion deadlines. Automatic recruiting checks the shared LFG list every 15 seconds and keeps at most one pending invite per party. API-side party notifications use a durable PostgreSQL outbox with bounded exponential retries.
