# FDP tournament participation

Tournament lists, rules and public rosters can be browsed before registration.
Participation requires the existing Dota profile (MMR and positions), a linked
Telegram account and the existing tournament partner gate. New visitors use the
same profile wizard as player search, starting at MMR; this path never starts
ordinary player search. Selected tournament and entry remain in the return URL.

## Entry paths

- **Find a tournament team:** starts a persistent BOARD search and shows incomplete
  OPEN and CONFIRM rosters. Players join OPEN rosters or apply to CONFIRM rosters.
  Captains see the player only while the search is active and can offer a position.
  This action never automatically enrolls the player.
- **Automatic matching:** explicitly enabled separately; only AUTO queue rows
  can be assigned by the worker. If no open roster fits, at least two waiting
  players with distinct positions form a generated OPEN squad. Remaining places
  stay open. MMR ranks suggestions; tournament rules determine eligibility.
- **With friends:** register an owned persistent TEAM or create a generated OPEN
  event squad with the user's position. Captain can rename the event squad before
  bracket generation; the persistent TEAM name is not changed.
- Tournament positions are independent of profile preferences: creating, joining
  and changing a position allow any free slot from 1 to 5. Profile preferences
  provide defaults only. An automatic search keeps its selected tournament
  positions even if profile preferences are edited later.
- **Invitation:** `te_<entry UUID hex>` opens the exact entry in FDP and preserves
  intent through registration/linking. If the preferred position is occupied,
  offer another roster. Entry invitation links admit directly even for CONFIRM squads;
  ordinary catalog applications retain captain approval.
- **Bot:** existing session/profile are reused. Website buttons issue a fresh
  one-time authentication ticket for the selected tournament/team on every click.

## States and delivery

WAITING, REQUESTED, JOINED, CLOSED and NEEDS_PROFILE are authoritative API states.
RECRUITING means the lineup is incomplete, REGISTERED means the five positions
have a main tournament slot, RESERVE does not promise a main bracket slot.
Cancel withdraws a pending application or queue, never a joined roster.

Players can keep one application per entry in several teams in the same tournament.
The first successful acceptance or direct OPEN enrollment withdraws the other
applications atomically. The tournament advisory lock and the existing partial
unique index on active membership prevent enrollment in two teams. Pending
applications suspend automatic enrollment. Participation returns the complete
`requests` list; `request` remains the first item for older clients. Players can
withdraw individual applications or all of them. Team previews in the bot show
the event squad description, player profiles/MMR and free position actions.
Accepted-application notices expire after 120 seconds and are also deleted when
the player opens their team through the notice's callback.
The bot labels website access explicitly and offers roster exit with a 120-second
confirmation tied to the event entry and the player's membership. It refreshes
the linked session, rechecks membership and uses the existing roster exit endpoint,
including tournament cutoff rules and captain succession. Leaving a persistent
team's event entry transfers event captaincy without changing the base team owner.

Team chat access is labeled “Открыть чат команды” and opens the authenticated room
at `#tournament-team-chat`, scrolling to the chat once the room has loaded.
Participation shows current linked Telegram usernames to members of their own
event roster only. Public previews do not expose these contacts; missing usernames
are explicitly labeled rather than guessed.

Private bot navigation reposts the requested panel when the current menu message
is at least three days old. `panel_message_birth` persists the original send time;
editing does not reset it. Legacy panels recover the original date from their
own Telegram callback message. Only active private callback handling can request
this periodic repost: worker updates and inherited background tasks cannot.
Reposts are serialized per user, publish and save the new panel first, then strip
buttons from the old message. Old messages are retained because Telegram only
allows deletion within 48 hours. `/start` keeps its existing immediate repost.
Only Telegram writes share the publication lock; API rendering and image fetching
stay outside it. Countdown workers recheck the message and screen after waiting,
and queued search updates cannot reactivate an archived keyboard.

“Создать свою команду” in team search opens the existing position/create flow
without loading persistent teams. Entering it pauses the user's solo queue;
creating the squad withdraws pending applications atomically. Opening the form
does not withdraw applications. Captain acceptance racing creation can still
produce only one active tournament membership. The friends explanation is
underlined and the selected position remains dynamic.
Main API timeouts are normalized to `ApiError`, matching connection failures;
server status codes and messages remain intact. Group and Discord connections
continue using their separate, bounded pools.

Queue assignments, accepted/declined applications and completed main rosters
enqueue durable Telegram notices in the same database transaction. The ordinary
notification pipeline delivers them; the bot rechecks current participation and
suppresses stale notices before sending. Website participation uses the same
notifications. Local contexts handle event closure and status display without
duplicating outbox notices.

## Captain applications

New CONFIRM applications enqueue `tournament_application` notices in the same
transaction as the application. These captain notifications are independent of
recruitment preferences. Duplicate submissions do not enqueue
another notice; withdrawal/reapplication creates a new version. On captain exit,
pending applications are notified to the successor. Old recipients lose access.

“Посмотреть профиль” opens a fresh panel at the bottom of the captain's private
chat, then consumes the original notice. Opening the same player from the
captain's inbox consumes matching notices too; failed deletions are retried and
old controls are removed. A consumed in-flight send cannot resurrect its controls.

“Заявки в команду” is available to captains directly in their team menu. It lists
five players per page with profile buttons, MMR and requested positions. Detail
cards include Telegram contact, a full profile link and accept/decline actions.
The inbox uses native database cursor timestamps, so withdrawing a cursor request
does not skip the next player. It does not issue one HTTP request per player.

Both notification and profile actions use fresh linked sessions. The server checks
the current captain, notification recipient, application ID/version/position and
roster capacity. Decisions revalidate inside the tournament lock; the active-member
unique index remains the final protection against joining two teams. Profile
actions require their displayed application version; stale actions cannot approve
a replacement application. Completed/withdrawn applications lose their actions.

“Отключить уведомления” mutes only application notices for this captain/tournament.
It cancels queued notices and suppresses new ones while retaining all applications
in the inbox. Recruitment alerts and player acceptance notices are unaffected.
The clicked notice becomes a short inbox reminder without buttons and is deleted
after 15 seconds. The inbox provides “Включить уведомления” for re-enabling.
Apply additive migration `20261012193000_tournament_application_notices_preference`
before deploying the updated API and bot; the default is enabled.

## Compact player search menu

Waiting players and players with pending applications see three rows:
“Выбрать команду”, “Создать команду / Настройки поиска”, and “К турниру”.
The catalog shows every active tournament entry, including full teams and teams
with the player's pending application, four per page. Labels show member count,
full status or an application marker. Opening a team uses the existing member
preview and per-position application flow; returning preserves the catalog page.
The private paginated API selects only four entries and the viewer's own pending
request, rather than loading the full public tournament bracket.

Search settings contain positions, auto selection, stopping search and the
application inbox. Disabling auto selection preserves the selected positions and
changes the existing search to BOARD. Viewing teams or settings never enables
AUTO or enrolls the player. Old application and enrollment checks remain in use.
“К турниру” opens the tournament overview without cancelling search.

## Captain recruitment

Captains explicitly enable “Ищем игроков” for this tournament and immediately see
current matching searchers in the bot and the team page. Preferences are stored per
user/tournament, default off. “Остановить поиск игроков” cancels pending alerts but
keeps team enrollment available. Complete rosters stop recruitment automatically.
Alerts are durable digests, coalesced before delivery and scheduled no more than
once a minute per captain. Delivery checks current captain ownership, preference,
roster capacity and live searchers. A stopped or changed search disappears from
recommendations; unrelated ordinary PARTY/LFG search is never changed.

A captain's offer is tied to the player, queue generation, entry, role and current
captain. New invitations last six hours and do not reserve a slot. A player explicitly
accepts it; acceptance rechecks everything inside the existing tournament lock.
This explicit captain approval allows direct joining even for a CONFIRM entry.
Normal applications to CONFIRM entries still require a captain decision. Duplicate
offers for the same search/entry are suppressed. No new Telegram bot is required.

Opening a captain invitation publishes its current card at the bottom of the bot
conversation and consumes the original notice. Failed deletions remain queued;
a consumed send still awaiting its Telegram acknowledgement cannot resurrect a
notice. Notices also expire at their saved deadline and retire on joining another
entry, applying, stopping search or changing queue generation. Old invitations keep
their actual deadline rather than gaining an unannounced extension.
The website action first uses a callback so the bot can consume the source message.
The resulting panel contains the freshly authenticated website link. Stale invitation
actions refresh actual participation rather than leaving an unusable acceptance card.

At the owner's request, bot entry deep links, website `entry` links and direct squad
pages explicitly send `viaInvitation=true`. They admit without an additional captain
decision, including CONFIRM entries; the links are transferable and not restricted to
the captain's selected recipient. Ordinary catalog applications still use the entry's
join policy. Every admission retains account, profile, Telegram, sponsor, registration,
capacity, position, tournament lock and unique active-member checks. A member already
in another squad must use the explicit leave or whole-company flow.

## Companies of friends

“Ищем с друзьями” uses an existing temporary tournament squad marked as a company.
The organizer picks their role and receives the ordinary entry invitation. Friends
join using the existing registration and position flow. A company of two to four
shows each member's confirmation and a single primary action; five players become
a full tournament team using the existing registration rules.

Each person explicitly confirms “Ищем вместе”. Consent is bound to a SHA-256 hash of
active membership IDs, user IDs and positions. Any roster change or position change
clears all stored consents and requires fresh confirmation from every member,
including when a player returns to their previously confirmed position. Enabling
a company on an existing roster clears any earlier consent. A member can pause
their own consent from management; unconfirmed companies cannot be admitted. An organizer selects a
compatible destination and submits one application for the entire confirmed roster.
Normal auto matching does not fill companies with strangers while they gather friends.
Incoming catalog players require captain approval; direct friend links remain usable.

Captains see one company application in their native bot inbox, notification and
website management views, with every player's position/MMR and “Принять всех”.
Website decisions carry the displayed application timestamp and position, so an
old card cannot accept a replacement application. The
destination may also be an incomplete company, allowing 2+3 or 2+2 combinations.
The destination captain approves; transferring players have already authorized their
organizer to apply together. Source consent, roster snapshot, current organizer,
every account/profile/Telegram identity/sponsor gate, target capacity and all positions
are rechecked under the existing tournament advisory lock. Deactivating the source,
admitting everyone, withdrawing competing requests, registration updates and recipient
notifications commit in one transaction. Old source rooms expire and access follows
current membership. Concurrent accepts cannot split a company or create two active
memberships. A failed or stale operation leaves the source intact.

Apply additive migration `20261013160000_tournament_company_search` before enabling
the updated clients. Before rolling back to a server version without company support,
withdraw pending requests with a non-null `source_entry_id`; older code cannot interpret
their consent and whole-company semantics.

## Concurrency and isolation

Queue rows persist in PostgreSQL. Cancellation/restart increments a generation;
assignment checks row ID, generation, selected queue positions, current profile, active account,
Telegram identity, sponsor access and a renewable tournament lease. Pair creation
and both memberships commit atomically under the existing tournament lock.
No ordinary PARTY, LFG mode or ordinary search session is changed.

Each pass samples the oldest eight candidates for every position, avoiding
starvation behind a single-position queue. Scans rotate among waiting tournaments.
HTTP starts wait at most 1.5 seconds for an eager pass; later work runs separately.
Bot status polls process at most 24 due contexts with two simultaneous API calls;
incomplete rosters poll less often than waiting players. Room-only bots skip the
participation worker. The shared notification pipeline retains its normal retries.

## Release

Apply additive migration `20261011150000_tournament_solo_participation` with the API
release before bot/web rollout. Old API can run against the additive schema.
For the recruitment board also apply `20261012120000_tournament_recruitment_board`.
Existing queue rows default to AUTO; new bot/site board actions send BOARD explicitly.
Apply `20261012180000_tournament_multiple_applications` before releasing multiple
application clients. It removes only the single-pending-application index; the
active-player and active-position membership indexes remain intact.
Verification uses isolated PostgreSQL and bot mocks; never enroll real users to
test the queue or send them test messages.

## Verification (2026-10-13)

API and web type checks, Prisma validation and ESLint on the changed TypeScript
files passed. The full local API runner passed 302 tests and web passed 36 tests.
The final focused consent/admission run passed six tests. The production bot
candidate passed all 50 tournament bot tests, and API/web candidates built.

A fresh PostgreSQL container on an isolated Docker network passed migrations and
71 tests covering company consent, tournament participation, reserves, rooms and
series. Persisted cases include direct entry links, 2+2/2+3 company merges, paused
consent and simultaneous accepts. All friends remain together when two captains
race to accept their applications. No production records or real Telegram users
were used for these tests.

The production database was backed up before the additive company migration.
Previous API/web/bot image tags are retained for rollback. Before reverting the
API to a version without company support, withdraw pending company applications
as described above; preserve the additive columns.

## Tournament entry name and description in the bot (2026-10-14)

The user clarified that these edits apply to a team in a tournament. Its current
captain sees **Название и описание** on the team card and the friends/company
screen. The editor shows current values, accepts a new value as a private text
message, and has a separate button to clear the description. Name limits are
2–80 characters; descriptions accept up to 1000 and preserve line breaks.

The bot uses the existing entry `/name`, `/description` and `/room` endpoints.
It rechecks the current captain and entry before saving and uses the server's
room permissions. Rename is offered only while roster editing is allowed;
the API additionally freezes the name after bracket generation. Description
editing follows existing room permissions. These changes edit only the entry,
preserving any linked persistent team's name and other tournament entries.

Navigation cancels the text prompt. A transient API failure keeps the value in
the FSM draft and offers a retry. Entry changes and lost captaincy invalidate
the draft. Per-user publication generations prevent a delayed editor request
from restoring its screen or prompt after the user navigates away. The new
router precedes the general tournament callback handler. No new API routes,
migrations, or requests in ordinary search or navigation are introduced.

Verification uses real SQLite/FSM and isolated API/Telegram transports for the
bot, and the existing tournament rooms/participation integration suites against
an isolated local PostgreSQL database. No production entry or user is enrolled
or modified to test this feature.

The existing API build and ESLint check passed. All 49 isolated PostgreSQL
tournament rooms/participation tests passed, including a new check for captain
rename permissions, entry isolation, retained description and frozen bracket
names. The full bot run passed 270 tests; the final focused editor run passed
12 tests, including the company captain and retrying a failed description clear.

Production rollout on 2026-10-14 used code
`4e5c17e271bc89308fc4deacf6eba0d02d234085`. The candidate bot image passed
12 editor tests and 17 panel lifecycle tests. SQLite was backed up and the
previous bot image retained before switching only the main bot. Saved reward
settings were unchanged. Runtime verification confirmed the captain-only
button, router order, stale-navigation guard and a fresh reward-sync cursor;
API and web remained healthy. The isolated local PostgreSQL was stopped.
