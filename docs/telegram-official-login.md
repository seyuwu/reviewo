# Official Telegram Login for FDP

This integration uses Telegram's popup SDK and signed OIDC ID tokens. Users do not copy FDP verification codes. It supports signing into an existing Telegram-linked account and connecting Telegram to the currently authenticated website account.

## Setup

1. In the BotFather mini app select the correct FDP bot and open Login Widget / Web Login.
2. Select **Switch to OpenID Connect Login** if the legacy widget is active.
3. Add the exact website origin, e.g. `https://dota.opinia.ru`, to Allowed URLs. For local testing use the test bot and a localhost URL if BotFather accepts it. Never use the production bot token in the isolated local bot environment.
4. Keep the default **RS256** signing algorithm.
5. Set `TELEGRAM_LOGIN_CLIENT_ID` in the API environment to the public Client ID shown by BotFather. It must match the numerical ID in the configured `DOTA_BOT_TOKEN`. Restart the API after changing environment variables.

No Client Secret is needed for this SDK flow. The bot token remains on the API server. Compose passes the new variable only to the API. If no Client ID is configured, the existing bot/code flow remains available.

## Access and security

- The browser sends only the public Client ID and a server-generated nonce to the official SDK. It keeps a separate browser proof in memory.
- Requests expire after five minutes and are consumed atomically in Redis. Login and linking requests cannot be interchanged. Linking also requires the original authenticated website account.
- The API validates Telegram's RS256 signature, fixed issuer, audience, nonce, issuance time, expiry, and numerical Telegram user ID. Token-provided key URLs are never fetched.
- Only `profile` and bot messaging permission are requested; no phone number is requested.
- A bot messaging permission check must succeed before a new link is committed. A Telegram identity already linked elsewhere is never moved automatically.
- Administrator tournament access without Telegram remains limited to the server-authenticated `ADMIN` role.

## Existing bot-to-website shortcuts

The main **Chat and Discord** button continues to use authenticated, single-use website tickets and redirects to `#party-chat`. The website waits for participant access before scrolling to the chat. If ticket issuance is unavailable, the fallback is an ordinary website link and requires the website's normal authentication; it no longer depends on the legacy Telegram LoginUrl widget.

Old signed Telegram payloads and the existing code endpoints are still supported so previously issued links and bot versions can complete their flows during rollout.

An actual Telegram authorization round trip must be checked with a configured bot and an allowed website origin before enabling this integration in production.
