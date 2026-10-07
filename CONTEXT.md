# FDP Dota tournaments

This context covers Dota teams, party search, and organized tournaments across the FDP website and Telegram bot.

## Teams and tournaments

**Team**:
A persistent Dota 2 roster represented by a `GameParty` of kind `TEAM`.
_Avoid_: Party when referring to a persistent roster; tournament team when referring to the base team.

**Tournament**:
A scheduled Dota 2 event with its own registration period, rules, and lifecycle.
_Avoid_: Team; a tournament is an event, not a roster.

**Tournament entry**:
A squad's registration in one tournament, including that event's own lineup, five position slots, and join settings. It can link to a persistent team or exist only for this tournament; each entry is managed independently.
_Avoid_: Team registration as a synonym for the team itself.

**Temporary tournament squad**:
A squad for one tournament with its own five position slots, captain, chat, and Discord voice. A player can belong to one squad in that tournament and a different squad in another concurrent tournament.
_Avoid_: Party or persistent team.

**Tournament afterparty**:
The same squad's shared space retained for twelve hours after its tournament finishes, so participants can keep talking and add each other as friends. Its live chat and voice expire; the tournament's historical lineup and results remain.

**Tournament lineup**:
The players attached to one tournament entry. It is a snapshot scoped to that event and does not change automatically when the base team's membership changes.
_Avoid_: The live team roster.

**Tournament reserve squad**:
An event-scoped squad not included in the main bracket because the tournament's registered team limit is full or its registration has closed. It stays visible and may complete its lineup before the bracket starts. Tournament staff may substitute a full reserve squad for a registered team before that team's first match starts; completed matches and lineups are immutable.
_Avoid_: A registered team, a public matchmaking party, or a team automatically inserted into the bracket.

**Tournament match**:
A scheduled BO1, BO3, or BO5 series between two registered tournament entries. Winning a series requires one, two, or three game wins respectively. A team may have only one unresolved series in the same tournament at a time.

**Tournament game**:
One Dota game within a tournament match, with its own lobby readiness, result confirmation, and Dota match ID. Replaying an unconfirmed game preserves results of earlier confirmed games in the series.

**Bracket match plan**:
The organizer's chosen series format and start time for a position in the bracket, even before its opponents are known.

**Match chat**:
A shared conversation for the two match lineups and tournament administrators or moderators. Spectators do not participate in this conversation.

**Match chat mention**:
A message addressing a selected participant or tournament organizer. Each recipient receives at most one mention notification per five minutes within that match chat, shared across all senders; further mentions remain visible without another notification.

**Double elimination**:
A bracket in which a team's first series loss sends it to the lower bracket and its second eliminates it. If the lower-bracket champion wins the grand final, a reset final gives both finalists one last series.

**Match workflow**:
An administrator schedules the pairing and host side. The host roster creates the Dota lobby and submits its name, password, and optional evidence. Only the two tournament lineups can view those credentials. A player from the opposing lineup confirms the configured settings; after the match, one side reports the winner and the other confirms or opens a dispute for an administrator.

**Dota match ID**:
After a game ends, either captain can save one numeric Dota match ID for that game. The ID is shown publicly on the match page so players and spectators can find the replay in Dota 2; each Dota match ID is unique across all tournament games. Captains can correct an incorrectly entered ID.

**Search isolation**:
Party search and tournament lineups are separate. Starting or joining ordinary party search never adds a player to a tournament team; tournament roster changes require the explicit tournament page flow.

**Manual lobby integration**:
The first version records and confirms match information; it does not create a Dota lobby, inspect its settings, or retrieve game results through a Valve API. Spectators can use the lobby's spectator option when enabled or the match's optional stream link.
