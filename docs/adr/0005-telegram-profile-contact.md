# Telegram profile contacts respect visibility with an administrator exception

## Decision

- Store the Telegram username on the linked Telegram authentication identity. Store public contact visibility on the user account, defaulting to false. Never derive usernames from numeric Telegram IDs or accept a username entered in a website profile form.
- Accept username changes only through the existing bot-secret-protected identity link endpoint (which also authenticates the linked website user), or a verified, signed Telegram login. Preserve identity uniqueness checks. An explicit null clears a removed username; omitted values from older bot clients leave it unchanged.
- The bot synchronizes usernames in a background task after processing a private message or callback. Successful unchanged values are checked at most once a day; changed values trigger synchronization on the next interaction. API failures retain the previous value and delay retries for five minutes. Cancel pending tasks before closing API/storage on shutdown.
- Serve contact data from a separate profile endpoint. A hidden username is returned only to the profile owner or a verified ADMIN. Tournament moderators have no exception. Guests and other users receive null. Never expose Telegram IDs or authentication identity rows.
- Only the authenticated profile owner can change visibility. Viewer-specific contact responses use `Cache-Control: private, no-store`. Hidden usernames are not placed in public profile SSR, metadata, entity attributes, LFG results or party responses. Profile navigation and sign-out clear the previous viewer's contact state.
- The Dota profile shows a Telegram link when allowed. Owners can toggle public visibility and are told that administrators can still see hidden contacts. Administrators viewing a hidden contact see an explicit badge. Older accounts obtain their username at their next bot interaction or Telegram login; the database migration cannot infer usernames from existing IDs.

## Consequences

Contact retrieval adds a separate query only on profile pages. It does not alter matchmaking queries, search timers, party slots, tournament membership or analytics. No Telegram bot process or production deployment is required to build the feature locally.
