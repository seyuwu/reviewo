# FDP tournament participation

Tournament lists, rules and public rosters can be browsed before registration.
Participation requires the existing Dota profile (MMR and positions), a linked
Telegram account and the existing tournament partner gate. New visitors use the
same profile wizard as player search, starting at MMR; this path never starts
ordinary player search. Selected tournament and entry remain in the return URL.

## Entry paths

- **On my own:** join a compatible OPEN roster, or explicitly start automatic
  matching for this tournament. If no open roster fits, at least two waiting
  players with distinct positions form a generated OPEN squad. Remaining places
  stay open. MMR ranks suggestions; tournament rules determine eligibility.
- **With friends:** register an owned persistent TEAM or create a generated OPEN
  event squad with the user's position. Captain can rename the event squad before
  bracket generation; the persistent TEAM name is not changed.
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

Queue assignments, accepted/declined applications and completed main rosters
enqueue durable Telegram notices in the same database transaction. The ordinary
notification pipeline delivers them; the bot rechecks current participation and
suppresses stale notices before sending. Website participation uses the same
notifications. Local contexts handle event closure and status display without
duplicating outbox notices.

## Concurrency and isolation

Queue rows persist in PostgreSQL. Cancellation/restart increments a generation;
assignment checks row ID, generation, current profile roles, active account,
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
Verification uses isolated PostgreSQL and bot mocks; never enroll real users to
test the queue or send them test messages.
