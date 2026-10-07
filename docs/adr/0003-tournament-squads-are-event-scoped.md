# Tournament squads are event-scoped

Tournament rosters are separate from both persistent Dota teams and ordinary party search.

## Decision

- A `DotaTournamentEntry` can either snapshot a persistent team's roster or stand alone with no `GameParty` relation.
- A standalone entry is created only from the tournament page. Its members, position assignments, applications, and invite links are managed there.
- The captain occupies one of five distinct positions. An entry stays in `RECRUITING` until all five positions are filled; it then becomes `REGISTERED` and counts against the tournament's team limit.
- Joining, accepting an application, and leaving only change the event-scoped lineup. They never create or update a `GameParty` or a matchmaking search.
- Existing roster members without a position can claim a free role from their Dota profile during registration. This changes only the tournament snapshot and uses the same tournament lock as joins and approvals.
- A shared invitation URL opens the squad's own room. Joining or applying still requires the user's explicit action there.

## Consequences

Players can recruit for a specific event without creating a permanent team, and the tournament page shows each position as occupied or open. Ordinary party search remains unchanged. The squad's room remains available as a twelve-hour afterparty after the tournament ends, then its chat and Discord voice are deleted. Historical rosters and results remain. Persistent teams can still register separate lineups in multiple tournaments. See ADR 0005 for the room boundary.
