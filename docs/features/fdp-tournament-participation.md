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
  offer another roster. Existing CONFIRM squads still require captain approval.
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
captain. It lasts 20 minutes and does not reserve a slot. A player explicitly
accepts it; acceptance rechecks everything inside the existing tournament lock.
This explicit captain approval allows direct joining even for a CONFIRM entry.
Normal applications to CONFIRM entries still require a captain decision. Duplicate
offers for the same search/entry are suppressed. No new Telegram bot is required.

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
