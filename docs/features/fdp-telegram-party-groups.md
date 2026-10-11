# FDP private Telegram party group pool

## Deployment

Apply migration `20261011000000_telegram_party_chat_pool` by starting the updated
API before updating the bot. Pass the same `DOTA_BOT_ADMIN_IDS` allowlist to both.
Enable `DOTA_BOT_PARTY_ROOMS_ENABLED=true` for the main bot. An empty pool has no
effect on registration, search, account linking, or existing website chats.

In `/admin → Группы пати`, the owner selects each new empty private supergroup.
For bulk setup, use “Подключить несколько групп” and forward the supplied
`/fdpchat` message to the groups using Telegram's multiple-recipient forward dialog.
Only a configured FDP administrator who owns the group can connect it this way.
The bot checks privacy, forum mode, its management rights, the owner's creator
status, and that only administrators and the bot are present. Use hidden history
for new members. Use only the bot's controlled invitations for players; owner and
moderator invitations or manual admissions bypass automated membership checks.
Basic groups must first be converted to supergroups (enable topics, then disable
them) before connection. No public usernames or forum topics are used.

The pool limit defaults to 10. Twelve connected groups provide physical spare
capacity during cleanup. Limit 0 pauses new allocations. Disabling a group drains
its current party naturally. Removing an occupied group schedules registry removal
after cleanup; it never deletes the Telegram group itself.

## Access and lifetime

Active temporary FDP parties reserve a group as soon as their bot party panel is
shown after creation, including a party with just its captain.
The primary party chat button stays inside Telegram when the pool is enabled.
While a group is being prepared, it shows that state. Capacity or service failures never
silently redirect this button to the website. Website chat and Discord remain
available through the explicit party settings link.
Allocation is serialized by a PostgreSQL pool row lock and a unique party ID.
Groups are assigned only to workers whose Telegram polling heartbeat is recent.
The bot receives each join request and validates the current Telegram identity,
party membership, invitation, room state, and generation. Unknown or stale requests
are declined. Normal chat permissions are open only after group preparation;
players never receive administrator or invitation-management privileges.

Roster removals, changed Telegram bindings, and leaving the Telegram group rotate
invitations. Remaining members stay in the group. A player who left only Telegram
can return while still an FDP party member. Confirmed bot-owned bans can be lifted
for eligible members; moderator removals must not be overridden. Private party
panels and tracked invitation notices are refreshed on generation changes.

Ban ownership is also recovered from Telegram membership updates using the actor
ID, even if the removal succeeded but its API report was interrupted. Updates are
ordered per player by Telegram timestamp and update ID; delayed leave events do
not erase a newer ban. Ownership survives group reuse and manual cleanup
confirmation. Every automatic unban rechecks current ownership on the API so a
moderator's subsequent ban is preserved.

Groups keep history hidden for newcomers. After a confirmed Telegram join, the
worker sends a fresh roster card, pins it and deletes the preceding card. Editing
the older card alone would leave it invisible to the newcomer. Consecutive joins
are coalesced for two seconds, and persisted join versions prevent a concurrent
join from being lost when a card send is acknowledged. Existing active groups
receive one replacement card after this feature is first enabled.

Stopping recruitment does not end the party or group. Party extensions update
invitation expiry. Canonical merged or deleted parties enter cleanup. Mere expiry
does not release the group before normal API cleanup has handled Discord occupancy
and possible lifetime extension. Failed preparation times out after 10 minutes.
A successfully prepared chat follows the party lifetime, including when players
have not entered it yet. New assignments wake synchronization immediately and preparation
takes priority over ordinary card refreshes. The invite becomes available before
the roster card is posted. Existing website chat/Discord access remains explicit
in party settings.

The main party panel shows “Готовим чат” with an approximate five-second hint
while preparation is pending. Every Telegram-linked member, including players
combined by automatic solo search, gets “Чат пати готов!” with an entry button.
The existing private notification queue retains its rate budget; preparation runs
on the separate room-service session. A room lookup can hold a panel for at most
two seconds, and transient failures are handled by the background worker.

New temporary parties last 3 hours. Captains and officers can use
“Настройки пати → Продлить пати · +3 часа” to add 3 hours, up to the existing
12-hour maximum from creation. The settings show the remaining lifetime.
Existing parties retain their saved expiry; changing the default does not end
their sessions early.

Clicking an occupied party slot opens the player card. “Позвать в чат” queues a
private FDP notification with the sender name and a current chat button. It is
available only for another Telegram-linked member of the same temporary party.
Sender and target membership IDs, current Telegram bindings, active account and
party lifetime are checked before enqueueing and delivery. A shared recipient
membership lock and the notification journal enforce one ping per recipient per
party in a rolling five-minute window, across all senders and bot instances.
Expired, removed or rejoined memberships invalidate queued pings. Notifications
expire after at most five minutes; native group links are refreshed on rotation.

## Native guard pilot

In BotFather's Bot Settings, enable Guard Mode. Confirm that
`getMe.supports_join_request_queries` is true. In one connected supergroup,
open Manage group → Administrators → FDP → Process join requests and save.
Confirm `getChat.guard_bot.id` equals the managing bot ID. Keep the bot-created
invite links' approval setting enabled. These Telegram settings are separate
from ordinary administrator rights and cannot be replaced by granting all rights.

Queries with `query_id` are durably journaled and dispatched immediately, with
three concurrent handlers and serialized work per group. They use the same
authoritative admission checks, operation lease and possible-member tracking as
ordinary requests. The processing budget is eight seconds; Telegram requires
an answer within ten seconds. Failed checks decline admission. Ordinary requests
keep using the existing worker. Ambiguous or interrupted approvals require room
review, and successful admissions are checked again against the current roster.

Verify on one group that a party member can enter, a nonmember is rejected, and
the installed Telegram client opens the chat after approval. Direct approval is
supported by the API; automatic navigation must be confirmed on actual clients
before enabling the mode in every group. A Mini App is not needed for this pilot.

## Durability and cleanup limits

The bot session journals incoming group metadata before returning a long-poll
batch, hence before a later getUpdates call can acknowledge it. It stores IDs,
timestamps, membership changes and join requests, not message text or media.
The local SQLite inbox is transferred idempotently into the shared API database.
Bot-generated group messages are journaled from their API responses as well.
Potential participants are persisted before an approval request is sent. A lost
Telegram approval response quarantines the room instead of hiding that user from
later cleanup. Confirmed ban-with-revocation acknowledgments account for known
messages from that sender; conservative timestamp boundaries leave recent races
for ordinary individual deletion.

Messages are scheduled for deletion after 12 hours. This is a bot-managed timer,
not Telegram's native auto-delete setting: deletion requires a working bot.
On party termination, invitations are revoked, group writes are suspended,
members removed and verified, tracked messages deleted in batches of up to 100,
and member count checked against the administrators. A free group is released
only after pending tracked deletions and removals are acknowledged.

Bot API cannot enumerate the full group history. Telegram's create-group service
messages cannot be deleted, and ordinary deletion is limited to messages younger
than 48 hours. Polling outages of 20 hours or longer conservatively mark groups
for review, before Telegram's 24-hour update retention can lose metadata. Transport
uncertainty, lost rights, changed group IDs/admin lists, old messages and incomplete
cleanup also quarantine a group. Automated retries do not erase uncertainty.
The owner may manually clear history for everyone, remove players, and explicitly
confirm cleanup through the administrator UI. This is a human confirmation, not
a claim that the bot inspected the entire history.

## Multiple bots and core-flow isolation

One bot owns each group, its invitations and its operation lease. PostgreSQL
stores assignments and generation checks; leases serialize worker operations.
Different bot tokens can serve different groups in the same pool. The main bot
allocates across online workers and delivers private invitations, so players do
not need to start helper bots.

A helper runs the same image with `DOTA_BOT_ROOM_WORKER_ONLY=true`, its own token,
its own SQLite path/volume, rooms enabled, and the shared API secret and admin
allowlist. It runs only the pool worker and pool administrator UI, not search,
registration, newsletters or account-linking tasks. Run one long-poll consumer
per token. Transfer ownership only after draining and removing the previous
registration, revoking old invitations and removing the former bot from the group.

Group operations use a separate API connection pool of four sockets. Background
Telegram mutations are paced at five per second, private pool notices at two
per second globally and at least 1.1 seconds apart per recipient. Party cards
update only when dirty, maintenance sweeps run at most once per minute per quiet
group, and groups get service-operation leases. Telegram retry_after responses
delay the corresponding work. Core search and account flows do not await cleanup.

## Manual release checks

Before enabling real usage, connect one group and exercise joining, a forwarded
invitation from a nonmember, leaving FDP, leaving only Telegram, rejoining, link
rotation, party deletion, restart recovery and incomplete-cleanup quarantine.
Then connect the remaining groups and increase the working limit if needed.
