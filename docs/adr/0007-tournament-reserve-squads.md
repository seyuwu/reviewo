# Tournament reserve squads

## Status

Accepted

## Decision

Tournament entries that are not selected into the main field use the `RESERVE` status. An incomplete reserve remains visible and may recruit players while registration is closed but before the bracket starts. Reserve entries do not count toward `maxTeams` and are never seeded automatically.

When the registered-team limit is reached, registration closes and remaining recruiting entries become reserves. Closing registration manually or by deadline does the same. Only complete reserves with five distinct roles can be assigned by tournament staff to a scheduled match, before that team or match has started. The replaced registered entry is disqualified and the bracket seed is moved to the reserve entry.

## Consequences

- Public tournament pages distinguish reserve squads from registered teams and keep them joinable during the pre-start reserve window.
- Match assignment is a staff action; a reserve is not inserted automatically when a team is absent because attendance cannot be verified by the application.
- A started match, prior match result, or previously scheduled match prevents substitution, preserving bracket history.
