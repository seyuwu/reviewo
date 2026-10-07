# Tournament squads own collaboration rooms

Each tournament entry has its own room, authorized against that event's active lineup. Chat and Discord voice use this room rather than a shared persistent team or ordinary matchmaking party, because players may join different squads in concurrent events while still using normal party search. One active lineup per player per tournament remains enforced by the existing partial unique index.

Administrators and tournament moderators may read any live tournament room, including its twelve-hour afterparty, without joining the lineup. This exception applies to chat reads and change subscriptions only. Writing messages, changing a lineup, and creating or entering its Discord voice continue to require the corresponding membership or captain permissions. Participants are informed that tournament staff can read the chat.

Completing or cancelling an event fixes its finish time and sets each room's expiry to twelve hours later. Afterparty departures affect room access only, preserving the historical lineup, bracket, and podium. Expiry deletes the room's chat and Discord channel; failed Discord deletions retain cleanup metadata for retry. Tournament rooms never enter ordinary matchmaking, including during the afterparty.
