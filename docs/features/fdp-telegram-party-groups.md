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
status, and that only administrators and the bot are present. Visible history
requires a one-time owner cleanup confirmation as described below; hidden history
remains supported. Use only the bot's controlled invitations for players; owner and
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

Groups may expose current-party history to newcomers after the owner confirms the
initial cleanup. The owner enables history visibility in Telegram; Bot API cannot
toggle it. After a confirmed Telegram join, the worker sends a fresh roster card,
pins it and deletes the preceding card. This also supports hidden-history groups,
where editing the older card alone would leave it invisible. Consecutive joins
are coalesced for two seconds, and persisted join versions prevent a concurrent
join from being lost when a card send is acknowledged. Existing active groups
receive one replacement card after this feature is first enabled.

The shared card also has “Управлять пати”, opening the main FDP bot directly at
the current player's party panel. The `manage_<party UUID>` link is navigation
only: the bot rechecks current membership and never joins a party from that link.
Helper workers use `DOTA_BOT_MAIN_USERNAME` (default `FDPdotabot`) for this action.

The single private party invitation offers “Указать Dota ID” only when the current
member has no ID. The shared card also offers it when any member lacks an ID.
`dotaid_<party UUID>` opens the existing ID-only form in the main bot, rechecks
current membership and returns to the party. This remains available as a private
alternative to the locally prepared in-group reply flow described below.
The ID form opened from a party explains that the ID is required for readiness.
The API rejects readiness for a temporary party without a saved Dota ID; joining
the Telegram group and continuing search remain available. A rejected group
readiness action previously showed the player a private ID entry button. The
prepared change below also accepts an explicit reply inside the assigned group.
Existing IDs are reused by ordinary readiness actions.
Shared roster cards expose Telegram usernames only when the player shared their
contact with this party or made it public.

“Позвать в чат” opens an ephemeral list visible only to the clicking member.
Selection tokens are bound to that member, group and generation, expire after
two minutes and cover at most four other players. The room owner worker validates
active party membership and presence before delegating to the existing ping
service. Its per-recipient five-minute cooldown and membership fences remain in
effect. Delivery goes through the main bot's durable outbox even when a helper
serves the group. Menus allow five openings per group per minute, with a five-second
per-user pause, protecting the shared Telegram mutation budget.

“Discord” records one click per current party membership and prepares native
Discord voice on demand. Each additional distinct player increases the voice
channel limit, up to five; repeated clicks do not add seats. The invitation is
shown privately inside the Telegram group and opens the party's voice channel.
This explicitly selected guest mode requires no Discord/FDP account binding:
other guild members may connect if seats are free. It is a channel capacity
limit, not identity-based admission. Other parties and teams keep their existing
Discord access policy until guest mode is selected for their Telegram party room.
Slow voice preparation runs outside database row locks and Telegram room leases.
It also uses its own two-connection HTTP session so native Telegram admission
queries retain the room service's four-connection session and ten-second budget.
Discord replies share the existing background Telegram mutation budget; each
group can prepare five private invitations per minute to protect chat capacity.

Private match-found notices, readiness reminders, chat-ready links and party
pings are tracked by party ID and the recipient's current membership ID. Leaving,
deleting or kicking through the bot queues the corresponding notices for deletion
immediately. A batched membership check every five seconds also handles website
actions, expiry, merges, unlinking Telegram and state changes missed during restart.
Transient API errors preserve current messages; an old membership cannot keep
notices alive after a player rejoins. New messages and existing saved notice
pointers are both covered, including messages still being delivered during exit.

Stopping recruitment does not end the party or group. Party extensions update
invitation expiry. Canonical merged, deleted, orphaned or empty parties enter
cleanup. Expired parties without a Discord channel enter cleanup immediately.
For voice-backed parties, normal API cleanup first handles Discord occupancy and
possible lifetime extension; it must not interrupt an active call. Failed
preparation times out after 10 minutes.
A successfully prepared chat follows the party lifetime, including when players
have not entered it yet. New assignments wake synchronization immediately and preparation
takes priority over ordinary card refreshes. The invite becomes available before
the roster card is posted. Existing website chat/Discord access remains explicit
in party settings.

The main party panel shows “Готовим чат” with an approximate five-second hint
while preparation is pending. Match-found and chat-ready events share one short
private invitation per current membership, with party name, member count and the
player's position. Preparation updates that same message to add “Войти в чат пати”;
it never emits a separate chat-ready message. A new roster updates existing
invitations and sends one to newcomers. A captain alone does not get an invitation.
Readiness is confirmed from the shared group card rather than from the private
invitation or the main party panel. Confirmed group presence removes the invitation
and suppresses subsequent match-found notices for that membership. An invitation
URL click alone does not count as group presence. After two minutes with a ready
chat, at most one reminder replaces the invitation for a player who has not entered.
Legacy chat-ready notices are reused or deleted when upgrading an active party.
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
members removed and verified, and the original title restored. The API records a
cleanup fence after those mutations. The worker then waits for a Telegram poll
started after that fence and durably journals its result, including the trailing
leave/title service messages. It drains tracked deletions in batches of up to 100
and checks member count against the administrators. Only then can the API release
the group. Restarting the worker requires a fresh poll again. A retry of this
settling phase does not repeat title changes or participant removals.

Late messages recorded while a group is free automatically return it to cleanup.
Allocation additionally excludes free groups with pending tracked deletions in
the existing selection query. Message text/media are not copied or replayed.

Bot API cannot enumerate the full group history. Telegram's create-group service
messages cannot be deleted, and ordinary deletion is limited to messages younger
than 48 hours. Polling outages of 20 hours or longer conservatively mark groups
for review, before Telegram's 24-hour update retention can lose metadata. Transport
uncertainty, lost rights, changed group IDs/admin lists, old messages and incomplete
cleanup also quarantine a group. Automated retries do not erase uncertainty.
Read-only Telegram network failures and connection-establishment failures before
a write was sent instead schedule automatic retries after 5–30 seconds. Known-ID
deletion, permission freezing and title restoration also retry on network/server
errors: repeating these specific operations is safe even after a lost reply.
Message IDs are acknowledged only after successful deletion. Ambiguous admission,
invitation creation and ban ownership retain their conservative review policy. Confirmed
configuration errors or rejected operations still stop allocations, but do not
invent history uncertainty: after correcting the issue, successful retry cleanup
can release the group. Existing history uncertainty always survives those retries.
The owner may manually clear history for everyone, remove players, and explicitly
confirm cleanup through the administrator UI. This is a human confirmation, not
a claim that the bot inspected the entire history. A newly registered group with
visible history stays in review until that explicit confirmation establishes
`historyBaselineAt`. This marker survives normal reuse. Retrying cleanup does not
erase genuine history uncertainty or substitute for the owner's confirmation.

The main bot stores each administrator's review alert message ID and sends only
one alert per unresolved review, across restarts and repeated cleanup attempts.
Alerts remain while cleanup is in progress. Once the room is released or removed,
all tracked alerts for that room are queued for deletion in administrators' private
chats. The delivery journal retains IDs before the sending coroutine resumes.
Legacy alerts without saved IDs are registered on their review-button click and
deleted if the review has already been resolved; Telegram cannot enumerate these
older private messages for automatic recovery.

### Invitation publication recovery

Returned bot-created invitations are journaled before the sender resumes; recovery
URLs are encrypted with the bot storage key. The worker stores a fenced pending
invitation receipt in PostgreSQL before enabling writes and publishing access.
Pending invitations never authorize admission. Publication moves that receipt to
the active invitation list, and identical publication retries are idempotent.
After a lost API response, the worker reads authoritative status without revoking
the invitation. It retains its original lease token during readback.

A restart resumes the pending invitation instead of creating another link. The
local journal recovers a returned invitation whose API receipt was interrupted.
Receipts from older generations that cannot be reconciled quarantine the group
and retain the recovered link for revocation. All pending invitations must be
revoked before automatic or manually confirmed release.

### Review explanations and queue fairness

Review notices and the group administrator panel show a safe reason and a concrete
next action from structured error codes. Raw Telegram errors or invitation URLs
are never rendered. Rights, unexpected participants, old messages, interrupted
admission and uncertain history have separate explanations.

Read-only Telegram server errors use the same automatic retry policy as read-only
network errors. Server errors during writes retain the conservative review path,
apart from the repeatable cleanup operations explicitly listed above.
The worker excludes groups waiting for retry deadlines or another lease, backs
off failed API claims, and uses separate round-robin cursors for urgent and routine
work. When both queues are ready, routine maintenance gets at least one turn after
three urgent operations. Background request limits remain unchanged.

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

## Private party cards after roster changes

The 2026-10-14 regression scenario is a full 5/5 party followed by the last
participant leaving: the captain must see 4/5, a free position and working
recruitment controls. An old render waiting for an image and an old search timer
could previously overwrite the newer card. Combining a newer coordination
response with the older member list also preserved the departed player.

Private panel publication now checks a per-user render generation under its
existing lock. Loading transitions and timer writes participate in the same
generation, so obsolete results cannot restore an old roster or old controls.
The later coordination response supplies the member list and recalculated
capacity; the caption, buttons and image cache use that same snapshot. These
checks run in memory and add no API requests to the normal search flow.

`tests/test_party_roster_refresh.py` covers leaving between the two API reads,
delayed image rendering, delayed timer publication, image/cache consistency,
and restarting recruitment for exactly the freed position. The local diagnostic
replay additionally exercises the real API service and PostgreSQL removal and
replacement membership. This correction is prepared locally; production rollout
is a separate step.

## Navigation after deleting a party (14 October 2026)

The delayed `party_updated` notification previously fetched the current
membership and unconditionally opened `home` when the deleted party was gone.
That could replace an account or other tab opened in the meantime. The same
effect happened if the background membership request started before navigation
and finished afterward.

The handler now captures the existing panel and its publication generation
before the membership request. It refreshes only an open party view with the
same generation. An open settings view stays on settings while the party exists;
deletion still closes a party view that the user has not left. Notice cleanup
continues even when refreshing the panel is skipped. This adds no API requests
or database queries to navigation.

`tests/test_party_deleted_navigation.py` reproduced two failures before the fix
and now checks delayed notification delivery, navigation during the lookup,
reopening a new party, settings preservation, and closing the deleted party view.

## Mutual position selection for automatic party merging (14 October 2026)

An automatic merge requires every incoming member's occupied position to be
selected in the opposite captain's current recruitment settings, in both
directions. A carry on position 1 searching for 4 and 5 cannot merge with a
party occupying 2 and 3. A matching support can merge only when their own party
also searches for position 1. A partially matching group and an unassigned
member are rejected. Existing capacity, position uniqueness, MMR, exclusions,
invite and voice restrictions remain in force.

Previously the planner checked only for nonempty recruitment and distinct
occupied positions, so it admitted unrequested roles. The shared planner now
checks the selections during candidate matching and again after the repository
has locked and reread the parties and captain profiles. Changed recruitment
between matching and commit cancels the merge without moving any members.

After merging, recruitment retains the union of both captains' selected roles,
minus occupied positions. It does not automatically enable every empty slot.
When all selected positions are filled, recruitment stops even if fewer than
five players remain. These checks use the existing snapshots, add no queries
or network calls, and touch only temporary recruiting parties; ordinary solo
admission and tournament/company application flows are unchanged. Previously
merged production rosters are not modified or split by this correction.

Seven regression cases failed before the fix; all 15 planner tests now pass.
Four isolated PostgreSQL tests cover the reported rejection, mutual consent,
changed selections under the transactional reread, captain transfer and
persistence of the remaining selected roles. API compilation and ESLint passed.
The full local API runner passed 320 tests.

Production rollout used `ac6c0b2ca3b0c268c148295951553893bf51ac5f`.
The API candidate passed all 30 planner, PostgreSQL merge and coordination
checks on a separate PostgreSQL 17 instance and private Docker network, which
were removed afterward. PostgreSQL was backed up and the former API image kept
for rollback before restarting only the API. Bot/web containers and saved reward
settings were preserved. Runtime checks confirmed the exact image and corrected
planner behavior, healthy API/web, no recent error markers or container restarts,
and a fresh bot reward-sync cursor. The local test PostgreSQL was also stopped.

## In-group Dota ID replies (15 October 2026)

The user initially asked to batch this with later changes, then explicitly
authorized the combined production release. Deployment verification is recorded
below; the original private-entry flow remains available as an alternative.

When a player without a Dota ID clicks “Готов играть”, or clicks the shared
card's “Указать Dota ID” button, the assigned room bot asks for an ID directly
in the group. A selective ForceReply mentions that player and explains where
to find the ID. The player replies with 8–10 ASCII digits. The API saves it
through the ordinary Dota profile service and then confirms readiness; the
existing background reconciliation updates the roster card. This works in the
main bot and helper-only room routers without moving or clearing a private FSM.

The request is stored in the bot's existing choices storage and expires five
minutes after the latest prompt. It is bound to sender, serving bot, chat,
prompt message, room, generation, party and membership. Only that sender's
explicit reply to the serving bot's prompt is accepted. Unrelated messages,
bare numbers, other senders, old prompt IDs and replies from another chat/bot
cannot edit a profile. Per-user locks serialize prompt/save operations and
completed requests are consumed so concurrent replies do not save twice.
Repeated prompt openings have a three-second per-player/room cooldown.

The bot-secret-protected `POST /:id/dota-id/context` uses fresh active room
membership, presence and expiry. `POST /:id/dota-id` checks the same conditions
plus the original party/membership IDs and validates the numeric format before
editing the current member's own profile. It reuses ordinary profile ownership,
uniqueness and attribute-preservation rules, without creating helper user JWTs.
The room readiness call additionally fences the original membership against
leave/rejoin. An ID conflict permits a corrected reply. An expired/reassigned
request is rejected. If the ID was saved but the party changed before readiness,
the response explicitly distinguishes saved ID from unconfirmed readiness.
An uncertain API result never claims success and permits an explicit retry.

There is no new polling, table or migration for this feature. Only opening the
input and submitting a matching valid reply call the room API. Ordinary chat
messages/search flows add no network requests. Prompt/reply messages use the
existing room message journal, so they follow normal temporary-chat cleanup.
The private main-bot form and old deep links remain usable. A future release
must update the API before the main and helper bot processes.

Two updated regression tests first failed on the old link-only behavior.
Tests cover ForceReply, identity/context fencing, invalid and conflicting IDs,
retries, duplicate replies, both router registrations and real aiogram dispatch.
Isolated PostgreSQL tests use the real profile repositories, room service and
coordination service to verify saved ID/readiness, unchanged roles/MMR/peers,
duplicate-ID rejection and stale leave/rejoin replies. No real Telegram chats
or production players are used by these tests.

Validation: all 303 bot tests and 382 API tests passed. The latter run includes
both isolated local rewards and party-coordination databases, three new real
PostgreSQL ID scenarios and nine new API boundary/ownership cases. A real
aiogram dispatcher test confirms that an existing private profile-edit draft
survives the group reply. API compilation and changed-file ESLint pass. The
complete Nest graph resolves the profile dependency and both new room routes
without route collisions; no HTTP listener or real bot credentials are used.
The earlier prepared Telegram task checks remain local alongside this change.

## Complete tracked cleanup after party termination (15 October 2026)

The lifecycle and two-phase cleanup described above shipped with the in-group
Dota ID and task-review changes after the user's explicit combined-release request.
Always update the API before every main/helper room worker: older workers cannot
supply the new cleanup fence and post-cleanup poll proof, so rooms remain closing
until their worker is updated.

Regression tests first reproduced premature release and deletion-timeout failures.
Coverage includes expiry, deletion/orphaning, merging, empty rosters, existing voice
extension policy, trailing service messages, restart/poll barriers, transient
deletion retries, late free-room messages, immutable creation notices, initial
owner confirmation, retained history uncertainty and registry removal only after
message acknowledgement. Local PostgreSQL tests exercise real room transactions.
The follow-up review passed all 393 API tests, 312 bot tests and 36 web tests.
Final focused room tests also cover the subsequent waiting optimization: a group
waiting for its post-cleanup poll is excluded from claim/validation work in memory,
including after a worker restart. Twenty room tests pass after that change.
Registration now explains when initial owner cleanup is still required instead of
claiming the room is ready. Other review reasons point to the room's actual action
list. The room detail panel has a refresh button without returning to the list.
API/web type checks and changed-file ESLint also pass. No new table or migration is
needed for cleanup. It runs in the existing background room worker and separate
HTTP pool; ordinary search and chat-message flows gain no network calls.

Unknown old history still needs one initial owner cleanup. Telegram's 48-hour
deletion limit and immutable group-creation notices remain platform limitations;
the implementation never claims to enumerate or erase inaccessible history.

### Production verification

Release `9066fc40bdb3cac6636076318a8f6f89fd09e807` is running on API, web and
the main bot after validated PostgreSQL/SQLite/configuration backups. The new
additive rewards migration ran first, then the bot and web switched. Every
registered room belongs to the main bot; there were no separate helper processes
to update. No environment or room-capacity settings were changed.

The built API image passed all 393 tests on isolated PostgreSQL 17, including
the real room lifecycle transactions. The built bot passed 72 party tests with
network disabled. Startup checks verified both router variants, Dota ID handlers,
cleanup fence/retry/waiting code, fresh room-worker heartbeat and reward-sync
cursor after restart. API/web are healthy with the expected images; containers
have no restarts or checked error markers. Public health/rewards/search pages
return 200. The existing pool remained at three active, one review and six free
groups during verification. No real party was deleted or kicked for a smoke test.

The pre-existing review group was not force-released. Initial unknown history and
Telegram deletion limits still require the documented owner confirmation. Full
release evidence, preservation checks and backup location are recorded in
[the rewards release notes](fdp-rewards.md#совместная-выкладка-15-октября-2026).

## Recovery after live-chat reports (15 October 2026)

The first release missed two production states. A `FREE` room could retain a late
tracked message from an older cleanup; allocation correctly excluded it but the
worker never scheduled that existing row for cleanup. Separately, rotation froze
the whole group before removing a departed member. A delayed `getChatMember`
response after a successful ban turned this into `participant_removal` review,
leaving the remaining current players unable to write. Review also retained an
old roster, so a returning party member could remain bot-banned.

The reported room 12 still had an active party. Read-only checks matched its
members to Telegram and verified that no outsiders were present. Default writing
permissions were restored under a room lease without removing any participant or
force-clearing review. The permanent correction is covered by regression tests:

- Rotation opens/preserves ordinary writing permissions; only initial preparation
  and actual party-end cleanup freeze the group. Retrying an active party resumes
  rotation rather than closing/removing all members.
- Removal rechecks authoritative current membership and generation immediately
  before each ban. Current party members, the serving bot and administrators are
  not removal targets. Rejoin invalidates an old target list. Moderator bans are
  not claimed or undone by the bot.
- An already absent user is acknowledged without another ban. A successful ban
  permits three bounded confirmation reads; delayed/network confirmations retain
  the removal target and automatically retry without a false history-review alert.
  Durable Telegram actor updates still recover bot-ban ownership across restart.
- Legacy `participant_removal` reviews refresh the real roster and resume a live
  party. Real history-gap uncertainty is preserved. A live party cannot remain in
  an interrupted closing pass, except an empty preparation that truly timed out.
  An occupied timed-out preparation resumes instead of freezing current players.
- Worker sync fetches pending-message counts in a bounded query and schedules
  existing dirty free rooms for cleanup. Clean free rooms skip extra transactions.
  Old IDs are submitted to Telegram too: missing messages can be acknowledged,
  while actual undeletable old messages still need owner cleanup. No IDs are
  acknowledged after a failed deletion.
- Administration counts only groups eligible for allocation (clean, enabled,
  not retiring, serving worker online), and explains the active-party retry and
  Telegram history setting.

Tests first reproduced the rotation freeze and delayed-removal errors, then the
legacy free-room and active-review failures. The final local API suite passes 401
tests; the full bot suite passes 322 tests. PostgreSQL coverage includes an actual
reservation after cleanup, not merely a count of rows marked free. TypeScript and
changed-file ESLint pass. These corrections add no table/migration and no requests
to ordinary search; added eligibility checks occur only during member removal.

History checks on enabled production groups confirmed hidden history in every
successful Telegram response, including room 12; one response was unavailable and
was not treated as a confirmed setting. The owner must enable “Изменить → История
чата → Видна” once after initial cleanup. Bot API exposes `has_visible_history`
but cannot toggle it; [the Telegram method is for user accounts only](https://core.telegram.org/method/channels.togglePreHistoryHidden).
Message contents are not stored/copied as a workaround. This history setting is
separate from writing permissions and does not justify muting existing players.

During production verification the history setting became visible in existing
groups 2, 4 and 12. The earlier baseline rule then quarantined even these already
established live parties. Existing-party evidence (a published card/link or a
known present roster member) now permits resuming that same party. Live/rotating
groups preserve writing and invitations after a visibility change. The worker
records history uncertainty once through the fenced `history-visible` event;
normal termination still requires initial owner confirmation before another party
can reuse that group. A newly assigned, never-published group with unknown visible
history remains blocked before its first invitation. History-gap reviews are not
automatically cleared. No current conversation is deleted to satisfy a setup check.

The follow-up report for group 1 reproduced a false-clean result in production:
four recent player messages still existed and were successfully deleted by their
individual IDs after the room had become free. The API incorrectly treated a
bot-owned participant ban as acknowledgement of every earlier message attributed
to that sender, including join notices. Delayed metadata inherited the same
assumption from `purgedThrough`. Neither path now acknowledges message deletion.
The worker submits every tracked ID to `deleteMessages`; only its successful
response permits acknowledgement. Missing IDs that Telegram already removed can
be safely included. Legacy purge acknowledgements are requeued once during
closing/preparation, preserving live conversations, and their obsolete marker is
removed so actual deletion receipts are not undone on every pass. Three database
regressions cover confirmed bans, delayed player/join records and legacy repair.

On the owner's explicit attestation of manual cleanup, empty unassigned groups
are confirmed only after checking the real creator, bot rights, administration
and member count. Occupied/assigned parties and disabled groups are excluded.
