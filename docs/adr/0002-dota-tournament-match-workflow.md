# Tournament matches use a confirmed manual workflow

Tournament match creation and gameplay remain separate from party search and from the Dota client.

## Decision

- An administrator schedules matches after registration closes, selecting registered entries, round and match numbers, time, lobby host, and an optional stream link.
- The match snapshots the tournament's game mode, region, spectator setting, and cheats setting at scheduling time. Later tournament edits do not silently change an existing match. A public match page is accessible from the bracket to everyone, showing these rules, status, result and roster snapshots. Private lobby credentials and workflow actions require the existing participant authorization.
- The assigned host captain creates the lobby and submits its name, password, and optional settings evidence. Only active members of either lineup can read the credentials; public match data and the admin overview never return the password. The host may share the credentials with spectators separately.
- Both captains explicitly confirm the configured settings and that all five players on their respective team have entered the lobby. This is a human assertion; FDP does not inspect the Dota client. Captains are the linked team's current owner, or the creator of a standalone tournament entry.
- The second confirmation starts a durable 120-second `SPECTATOR_ADMISSION` phase when spectators are enabled; otherwise the match becomes `READY` immediately. Match-row locking serializes concurrent confirmations; duplicate clicks cannot extend the window. The API rejects premature starts and reserves a separate 15-minute start deadline after admission. The public match page shows a server-based countdown and silently refreshes active preparation stages every five seconds while visible.
- After admission, only the host captain can mark the match as started, after launching it in Dota. The result deadline begins at actual reported start, not at spectator admission. Replay resolutions clear both confirmations and the admission timestamp. Existing confirmed matches retain their eligibility through migration; completed games are not reopened.
- One player submits the winner and optional evidence. A player on the opposing lineup confirms it or opens a dispute. Only an administrator can resolve a dispute by awarding either entry the win, scheduling a replay, or cancelling the match; the decision requires an admin note.
- Deadlines move stalled matches into the disputed state for admin review. The API periodically scans deadlines; the website shows the current deadline and each user can refresh the match state.
- A team cannot be scheduled into another unresolved match in the same tournament. A team may still register in other tournaments because each event has its own entry and lineup.
- Tournament lineups are changed through explicit tournament actions on the website. Search and party APIs do not write tournament entries.

## Consequences

This supports tournaments without a Dota client integration. Lobby creation, settings inspection, and result verification remain human-confirmed; a screenshot or stream link can help, but does not prove the game result by itself. Spectator access depends on the Dota lobby's spectator setting or a stream link provided by the organizer.

The first version used manual pairings. ADR 0004 adds automatic brackets and advancement while retaining this confirmed match workflow. Steam spectator links and automatic result extraction remain separate future work.
