# Automatic tournament brackets use frozen MMR seeds

## Decision

- New tournaments use single elimination with an optional third-place match. Existing events with manually assigned matches retain manual scheduling; unstarted events without matches adopt automatic scheduling.
- Starting a tournament freezes its registered, complete five-role lineups into numbered seeds ordered by average roster MMR. All five ratings must be known; incomplete ratings sort last. Ties use registration time and entry ID. Later profile edits do not reseed the event.
- Standard seed placement separates the strongest teams: seeds 1 and 2 can meet only in the final. The next power of two determines bracket size; missing seeds produce byes for the strongest teams. Only full registered entries participate, with 2–256 teams supported.
- A scheduled tournament starts within the 30-second scheduler interval when at least two complete teams are available. If too few teams are ready, registration closes without generating an invalid bracket; the organizer can reschedule registration or cancel. An organizer can also start a ready event immediately. Actual start time is recorded when the bracket is generated.
- All matches in a round must resolve before the next round is scheduled. Byes advance without fake gameplay records. Winners advance after opposing-team confirmation or a moderator decision. Semifinal losers enter a separate third-place match; with three teams the sole semifinal loser places third without a fictitious opponent. Two-team events have no third place.
- A generated bracket is derived from immutable seeds and confirmed match results. Future slots remain presentation-only until both opponents are known. Real match rows retain required opponent foreign keys and the existing lobby/result workflow.
- Start and advancement use the existing tournament advisory transaction lock. Unique seed and match constraints protect simultaneous starts/confirmations. The scheduler reconciles active events to recover advancement after a process restart. Scans use rotating batches of 25 so waiting events cannot starve later ones.
- Generated events cannot be reseeded, reopened or marked completed prematurely. Lobby settings are frozen for every round. A disputed bracket match must receive a winner or replay; cancellation applies to the whole tournament and cancels its unfinished matches.
- The event completes after the final and third-place result are settled. Public pages show a gold/silver/bronze podium with roster snapshots and a bracket toggle; list/search cards link to the completed bracket. Brackets scroll inside their panel on narrow screens. After matches are assigned, the event page shows the bracket rather than a duplicate match list or recruitment cards.
- Every assigned bracket node links to a separate, publicly readable match page with rules, status, result and both roster snapshots. Guests and nonparticipants do not request the private workflow endpoint. Optional verified identity identifies eligible participants (including the existing team captain authorization) without exposing user IDs. Public responses contain no lobby credentials, evidence URLs or dispute details; viewer-dependent responses are private and not cached. Lobby/result actions and credentials retain their existing participant authorization.

## Consequences

Tournament scheduling and advancement are automatic. Lobby creation, settings verification and result reporting still require players and moderators as described in ADR 0002. This does not create ordinary parties, enqueue matchmaking searches, or change Telegram search behavior. Multiple tournaments remain independent.

Manual events remain supported for compatibility. Completed manual events display a winner and runner-up only when there is a single unambiguous final; no third place is inferred from MMR.

## Validation

Pure bracket tests cover every team count from 2 to 256, deterministic ratings, seed separation, byes, podiums and stalled disputes. Local API runs cover simultaneous confirmations, scheduled start, four-team completion including bronze, permissions, premature completion, immutable settings, rollback of failed starts and normal website/Telegram matchmaking. Browser checks cover desktop/mobile layouts, podium members, bracket toggles, links and admin controls.
