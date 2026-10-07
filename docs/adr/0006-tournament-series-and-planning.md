# Tournament series and bracket-position planning

Each bracket position represents a BO1, BO3, or BO5 series. Confirming an individual game records its result and starts a fresh lobby-readiness cycle for the next game. Only winning the series advances the bracket. Games retain independent Dota IDs, timestamps, and confirmed results; a replay resets only the unconfirmed game. A moderator can adjudicate a game or award a technical victory for the whole disputed series.

Administrators and tournament moderators may plan BO and time while positions have no opponents. Plans use bracket kind, distance from that lane's final, and match number. This preserves final-stage settings when the actual entrant count is smaller than the registration cap, rather than silently applying a planned quarterfinal's settings to the final.

Actual match rows are created only once both opponents are known. BO becomes immutable after the first game starts. Time can change for an unstarted game, including between games of a series, and is enforced as the earliest permissible start. Late opponent availability moves an elapsed planned time forward. Editing is serialized with series confirmation and bracket advancement by the tournament lock.

Double elimination separates upper, lower, grand-final, and reset-final positions. A team leaves after its second series loss. The reset final is played only when the lower champion wins the first grand-final series; it is independently configurable. Ordinary party matchmaking and tournament-room membership are unaffected.
