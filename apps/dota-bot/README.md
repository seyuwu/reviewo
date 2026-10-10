# Dota.Opinia Telegram bot

The bot is a private-chat client for the existing Dota profile, LFG, party, and invite APIs. It automatically matches solo searchers with compatible open parties and does not store Dota profile data. Account sessions and guest recovery URLs in its SQLite database are encrypted with Fernet.

## Run with Docker Compose

Voluntary party departure is recorded by the API and excludes that party from future automatic joins, even after restarting search or switching between Telegram and the website. The bot still uses automatic matchmaking only: no new manual-search buttons are added. Players may return through the existing invitation/link flow; website users may explicitly claim a role or apply. Kicked players still require a personal invitation. Automatic party merging also respects departure exclusions.

The API migration `20261005020000_party_manual_rejoin` must be applied before running the updated API. Historical exclusion rows retain the stricter invitation-only policy because they do not record whether the player left or was kicked.

1. Create a Telegram bot with `@BotFather` and set `DOTA_BOT_TOKEN`.
2. Generate two independent secrets:

   ```powershell
   python -c "import secrets; print(secrets.token_urlsafe(48))"
   python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
   ```

   Put the first value in `TELEGRAM_BOT_API_SECRET` and the second in `DOTA_BOT_ENCRYPTION_KEY`. Use the same API secret for the API and the bot.
3. Set `DOTA_BOT_SITE_URL` to the public Dota.Opinia site URL. The internal API URL defaults to `http://api:3000` inside Compose.
4. Optional: set `DOTA_BOT_ADMIN_IDS` to a comma-separated allowlist of numeric Telegram user IDs. Administrators use `/admin` to compose an announcement, choose its deletion delay, preview/test it, and confirm delivery to all known users who have not blocked the bot. There is no news subscription toggle. The deletion delay starts at delivery to each recipient and survives restarts; presets and custom values from 1 second to 47 hours are supported. Test messages use the same delay. Username-based admin checks are not used.
5. Start the bot:

   ```powershell
   docker compose --profile dota-bot up -d --build dota-bot
   ```

The API migration is applied by the normal production API startup command. For development, run the repository database migration command before starting the bot.

## First-registration announcement

In `/admin`, **«Сообщение после регистрации»** configures an optional text or photo
announcement for first-time completed bot registrations. Preview/test it, choose
automatic deletion after 1 second to 47 hours, then save and enable. It is disabled
by default; disabling or removing it cancels pending deliveries. Existing users,
profile edits and repeated registration do not trigger it. Settings and delivery
markers persist in SQLite; delivery runs in the background. See
[`fdp-registration-announcement.md`](../../docs/features/fdp-registration-announcement.md).

The same settings include a **«Поделиться»** toggle (enabled by default). The
welcome message's sharing button sends a separate plain-text invitation with the
recipient's existing personal referral URL in place of “ссылка”. The user selects
Telegram's **Forward** action on this message to choose multiple recipients. The
invitation is deleted from the bot chat after 10 seconds, independently of the
welcome message's configured deletion time. Repeated taps reuse the visible
invitation. Inline mode and BotFather configuration are not required. Only the
personal referral URL carries attribution; forwarded copies retain the same URL.
Disabling sharing removes the button from future deliveries and pending notices.

## Account linking

An existing user opens **Profile → Account settings → Telegram bot → Link Telegram** on the website, then sends `/link CODE` to this bot within ten minutes. The bot never asks for website passwords. New users can create a guest profile in the bot; its recovery URL is encrypted in bot storage and can be shown from the account panel.

## Runtime state

The bot uses long polling and has no inbound port. `/data/dota_bot.db` stores encrypted auth/recovery secrets, the editable panel message ID, UI selections, automatic-match exclusions, delivered notification IDs, and temporary message deletion deadlines. Solo matching checks the shared LFG list every 5 seconds or when an action wakes it, and joins a compatible `OPEN` party on a free profile role. Starting recruitment marks every unoccupied party role as open; role assignment is randomized among the seeker's matching profile roles. API-side party notifications use a durable PostgreSQL outbox with bounded exponential retries.

The active solo-search panel offers **«Поиск по всем ролям»**. `PATCH /dota/profiles/lfg/roles` with `{ "allRoles": true }` expands only the current search to positions 1–5. It preserves profile roles, the search deadline, and analytics start events. Both web and bot matchers see this preference; the player receives one compatible free position rather than a roleless seat. An atomic active-solo check rejects stale taps after expiry, stopping, or joining a party. Starting a new search restores the profile's role preferences. Tournament squads and party recruitment are unaffected.

## Search timeout notices

After a Telegram search expires at 30 minutes or is successfully stopped manually, the bot queues a developer message for a solo player who has not joined a party, or for the captain whose temporary party still lacks players. There are at most two notices per Telegram user, shared across both modes and both ending reasons: stopping can trigger the first notice and a later timeout the second (or vice versa). The first explains the growing audience; the second is shorter. Stopping the last recruited role also qualifies; changing roles while recruitment remains active does not. Failed stops, successful matches, complete parties, stale searches, and tournament squads do not qualify. Previously delivered notices count toward the same lifetime limit; previously finished searches are not replayed.

The API exposes owner-only `lfgTimedOut` / `recruitmentTimedOut` signals calculated from existing LFG attributes. Stop/match paths clear the deadline, so a stopped search is not mistaken for an expired one. No new analytics write or extra database query is added to normal API responses. Recruitment stops recheck membership after the successful stop to avoid notifying a captain whose last slot was filled concurrently. The bot's SQLite `search_timeout_notices` table uses the same search event key for manual stops and timeouts, deduplicates the triggering search, and retains the two-notice limit across restarts. A separate worker sends queued notices through the existing temporary-notification lock; Telegram delivery waits do not block matchmaking or panel refresh. Messages expire after 20 seconds through the existing persistent deletion worker. Network failures retry; blocked users are terminal.

Both notices link to `https://t.me/FDPcommunity`. The **«Пригласить друзей · скопировать»** button copies a short invitation containing `https://t.me/FDPdotabot?start=src_referral_friends`. This anonymous link opens the standard home/start flow and records `referral / friends` attribution; it does not grant a session or join a party. Telegram may still require the recipient to press Start. Existing `party_<code>` links retain their party-invitation flow. The three-minute invitation reminder now uses the same tagged friend link.

Tests: `python -m unittest discover -s tests` from `apps/dota-bot` with its requirements installed. Timeout eligibility, the shared cap, persistence, transient/blocked deliveries, 20-second cleanup, notification serialization, actual CommandStart routing for new/returning users, new panel delivery, referral attribution and existing party payloads are covered without connecting to a working Telegram bot.

Local verification on 2026-10-05: 59 bot tests and 274 API tests passed; TypeScript and ESLint passed. Returning through another screen does not hide the captain's timeout notice; no new API requests are added on that screen before the 30-minute mark. A search restarted while an API request is in flight is not cleared or notified as the old search. The server deadline is authoritative, including when API or notification delivery delayed the local start timestamp.

## Acquisition links

Create a short lowercase campaign code for each placement, for example `https://t.me/FDPdotabot?start=src_telegram_group_01`, `https://t.me/FDPdotabot?start=src_tiktok_clip_01`, or `https://t.me/FDPdotabot?start=src_streamer_creator_01`. Supported source prefixes include `seo`, `community`, `telegram`, `discord`, `vk`, `tiktok`, `youtube`, `twitch`, `steam`, `search`, `referral`, `streamer`, and `site`. Keep codes anonymous and within Telegram's 64-character start-payload limit. Party invitations keep their separate `party_<code>` payload.

The FDP website preserves the first UTM/referrer attribution for 30 days and appends the channel and campaign to the Telegram start link. The web admin analytics records tagged FDP landing visits and bot-button clicks per channel. The bot's `/admin` panel reports first-touch funnel milestones once per user and, for the last 30 days, separates unique searchers from repeated search starts, search-result joins from all party entries (including invitations), and unique party creators from creation events. Search results and average time are counted only when the bot records a successful bot or website match while a search timer is active; direct invitation joins count only as party entries. This explicit result classification is available from the version that introduced it and cannot be reconstructed for older joins. Do not compare or add unique funnel milestones to repeated activity events; the historical `party_joined` milestone may include party creators and is omitted from the displayed results. Untagged starts appear as `direct`; users migrated before source tracking appear as `existing`. The current production snapshot, campaign-code register, UTM conventions, pilot schedule, budgets, and consent-first outreach templates are in [`docs/marketing/fdp-growth-90-day-execution.md`](../../docs/marketing/fdp-growth-90-day-execution.md).
