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
A tournament entry with no `GameParty` link. The captain creates it on the tournament page; members join or apply there, and it never participates in ordinary party search. It becomes a registered team only after all five distinct positions are occupied.
_Avoid_: Party or persistent team.

**Tournament lineup**:
The players attached to one tournament entry. It is a snapshot scoped to that event and does not change automatically when the base team's membership changes.
_Avoid_: The live team roster.

**Tournament match**:
A scheduled match between two registered tournament entries. Match settings are copied from the tournament when the match is scheduled; each team can progress through several rounds, but may have only one unresolved match in the same tournament at a time.

**Match workflow**:
An administrator schedules the pairing and host side. The host roster creates the Dota lobby and submits its name, password, and optional evidence. Only the two tournament lineups can view those credentials. A player from the opposing lineup confirms the configured settings; after the match, one side reports the winner and the other confirms or opens a dispute for an administrator.

**Search isolation**:
Party search and tournament lineups are separate. Starting or joining ordinary party search never adds a player to a tournament team; tournament roster changes require the explicit tournament page flow.

**Manual lobby integration**:
The first version records and confirms match information; it does not create a Dota lobby, inspect its settings, or retrieve game results through a Valve API. Spectators can use the lobby's spectator option when enabled or the match's optional stream link.
