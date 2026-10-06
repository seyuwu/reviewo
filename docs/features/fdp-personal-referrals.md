# FDP personal invitation analytics

## User flow

- The Telegram home menu has an **Invite friends** button. Each user has one stable opaque code, stored in the bot's persistent SQLite database. Links use `start=ref_<code>`; no Telegram ID or contact is embedded.
- The three-minute reminder and unsuccessful-search messages use the same personal link. Newly generated party links use `party_<join-code>_ref_<personal-code>`; the party join code and existing party membership flow remain unchanged. Previously published party and `src_*` links are still accepted.
- Only a new user's first bot interaction can be attributed. A repeated start, self-invitation or unknown personal code never creates a referral. Old shared links did not identify the inviter and cannot be reconstructed.
- Attribution and the first start are recorded together with the existing bot-user transaction. First account-created, account-ready, search and party-join milestones update the referral row, without an additional network request in those handlers.

## Synchronization

- A background worker sends at most 100 pending rows every 30 seconds to `POST /telegram/referrals/sync`. SQLite keeps an outbox across restarts and API failures.
- Each row has a revision. A successful upload acknowledges only that exact revision so an activity recorded during upload remains pending.
- The API validates a bounded batch, names, usernames, IDs, dates, milestone ordering and self-invitations. The existing bot secret is required; browser JWTs cannot submit referrals. Request rates are limited.
- PostgreSQL has one row per invitee Telegram ID. Retries do not increment counts. A different inviter/code/start cannot replace an existing attribution. Nullable milestone timestamps are merged without erasing or moving an earlier milestone forward.

## Administration

- `/admin/referrals` is linked from `/admin` and `/admin/analytics`. API endpoints under `/admin/analytics/referrals` require both a valid user JWT and ADMIN role. Tournament moderators have no access. Responses use private/no-store caching.
- Presets cover 1, 7, 30 and 90 days; custom ordered periods up to 366 days are supported. Start and end dates include the entire Moscow calendar day, with an exclusive next-day upper bound.
- Rank by the number of new invitees whose first start is in the selected period. Milestones are counted only if reached before the end of that period. "With an account" is a confirmed bot session/link; "Created accounts" is a new account created through the bot. Existing website accounts linked to the bot count only in the former metric.
- The ranking and each inviter's invitee list are paginated in groups of 25. Names come from current linked accounts when available, otherwise from trusted Telegram snapshots. Numeric Telegram IDs are used internally for administrative row selection, not in public invitation links.
- Read queries use date and inviter/date indexes, bounded result pages and a consistent transaction snapshot. Matchmaking queries, party slots, recruitment deadlines and tournament entry logic are not modified.

## Deployment

Apply `20261006050000_personal_bot_referrals` through Prisma migrate deploy before starting the updated API. SQLite tables are created additively when the updated bot starts. Deploy API, web and bot; leave their existing data volumes intact. Personal tracking starts with newly generated links after deployment.
