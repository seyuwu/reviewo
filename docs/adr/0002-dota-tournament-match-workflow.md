# Tournament matches use a confirmed manual workflow

Tournament match creation and gameplay remain separate from party search and from the Dota client.

## Decision

- An administrator schedules matches after registration closes, selecting registered entries, round and match numbers, time, lobby host, and an optional stream link.
- The match snapshots the tournament's game mode, region, spectator setting, and cheats setting at scheduling time. Later tournament edits do not silently change an existing match.
- A member of the assigned host lineup creates the lobby and submits its name, password, and optional settings evidence. Only active members of either lineup can read the credentials; public match data and the admin overview never return the password.
- A member of the opposing lineup checks the lobby against the configured settings and confirms or disputes it. The host then marks the match as started.
- One player submits the winner and optional evidence. A player on the opposing lineup confirms it or opens a dispute. Only an administrator can resolve a dispute by awarding either entry the win, scheduling a replay, or cancelling the match; the decision requires an admin note.
- Deadlines move stalled matches into the disputed state for admin review. The API periodically scans deadlines; the website shows the current deadline and each user can refresh the match state.
- A team cannot be scheduled into another unresolved match in the same tournament. A team may still register in other tournaments because each event has its own entry and lineup.
- Tournament lineups are changed through explicit tournament actions on the website. Search and party APIs do not write tournament entries.

## Consequences

This supports early tournaments without a tournament-bracket service or a Dota client integration. Lobby creation, settings inspection, and result verification remain human-confirmed; a screenshot or stream link can help, but does not prove the game result by itself. Spectator access depends on the Dota lobby's spectator setting or a stream link provided by the organizer.

Pairings are manually scheduled in the admin interface for the first version. Automatic bracket generation, automatic match advancement, Steam spectator links, and result extraction are separate future work.
