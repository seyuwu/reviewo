# Dota tournament spectators

Research date: 2026-10-06. Scope: human-created standard Dota 2 practice lobbies for FDP tournaments. No Dota client session or spectator connection was tested. This note distinguishes documented features, client protocol evidence, and proposed product behavior.

## Recommended first version

After both lineups confirm readiness, FDP should record a server timestamp for a 120-second audience admission window. When it expires, enable the host's manual start action. The host still launches the match inside Dota and confirms that action on FDP. When spectators are disabled, skip this window. This countdown is a website workflow rule; it does not control the Dota lobby or prove that a spectator joined.

For late viewers, publish the existing optional `streamUrl` and offer an explicit watch-stream action. A public stream is the practical route available without a Game Coordinator integration. Steam Broadcasting supports an audience setting that permits anybody to watch; the broadcaster must configure and actually run the broadcast. [Valve Steam Broadcasting support](https://help.steampowered.com/en/faqs/view/548F-BC55-89EB-1BC8)

Opening lobby credentials to spectators requires an explicit access decision. The existing FDP workflow keeps them restricted to the two lineups. Publishing the same Dota lobby password should be treated as granting lobby admission, with possible player-seat access before launch; it is not a website-enforced spectator-only credential. Host instructions and manual seat management are needed. Public lobby discovery is a documented Dota feature, but public visibility alone is not proof of continued post-launch DotaTV discovery. [Local workflow ADR](../adr/0002-dota-tournament-match-workflow.md), [Valve Reborn lobby announcement](https://www.dota2.com/reborn/part1/?l=english)

## What the evidence confirms

| Topic | Evidence and practical limit |
| --- | --- |
| DotaTV | Valve identifies DotaTV as the game's spectator tool for tournament and league streams. This confirms the feature, not universal public access to every private match. [DotaTV policy](https://www.dota2.com/dotatv) |
| Separate spectating settings | The lobby protocol has separate `allow_spectating`, `pass_key`, `leagueid`, `visibility`, and `dota_tv_delay` fields. The delay enum includes `LobbyDotaTV_120`. A two-minute stream delay is distinct from FDP's two-minute prestart admission window. Schema defaults do not establish current UI defaults. [Tracked lobby protobuf](https://raw.githubusercontent.com/SteamTracking/GameTracking-Dota2/master/Protobufs/dota_gcmessages_common_lobby.proto) |
| Watch eligibility | Live SourceTV listings include `is_watch_eligible`. `CMsgWatchGame` uses server Steam IDs and a lobby ID; its responses can report unavailable, lobby missing, server missing, or incompatible version. A known identifier does not itself grant access. [Tracked watch protobuf](https://raw.githubusercontent.com/SteamTracking/GameTracking-Dota2/master/Protobufs/dota_gcmessages_client_watch.proto) |
| Friend spectating | The protocol separates friend spectating and its `live` flag, with error states including not-friends, no-Plus, LAN lobby, wrong lobby type/state, and league lobby. These are protocol error possibilities, not a full rule table for ordinary delayed viewing. A copied Steam profile URL is not guaranteed to be watchable by strangers. [Tracked watch protobuf](https://raw.githubusercontent.com/SteamTracking/GameTracking-Dota2/master/Protobufs/dota_gcmessages_client_watch.proto) |
| League registration | Valve currently exposes a page titled League Signup, but the unauthenticated page does not establish approval criteria, processing time, or who can attach a league to a lobby. A league ID is a separate integration requirement. [Valve League Signup](https://www.dota2.com/league/0/list) |

The protobufs and command dumps above originate from tracked Valve client artifacts hosted by SteamTracking, a third party. They are stronger evidence of field and command names than a community tutorial, but they are not Valve's supported public API contract or an end-to-end access test.

## Watching commands and Steam launch URLs

The current tracked client command list contains `watch_server`, described as watching a server Steam ID. It also contains `url_execute` for incoming URL launch commands. Both entries carry a `developmentonly` flag in this dump; presence does not prove that a normal client/browser launch accepts them today. The list contains no `dota_spectate`, `watch_lobby`, or `watch_game` command. [Tracked commands](https://raw.githubusercontent.com/SteamTracking/GameTracking-Dota2/master/DumpSource2/commands.txt)

The current convar dump says `dota_spectator_auto_spectate_games` selects available games using a **LeagueID**. It also carries a `developmentonly` flag. It does not select a specific match. [Tracked convars](https://raw.githubusercontent.com/SteamTracking/GameTracking-Dota2/master/DumpSource2/convars.txt)

Therefore, treat `steam://rungame/570/76561202255233023/+dota_spectate...` as unconfirmed. Do not generate it as a working watch button, and do not substitute FDP's match UUID, a Valve match ID, lobby ID, or player ID for the server Steam ID. A possible `+watch_server` launch URL also needs an actual cold-start and already-running-client test with a publicly eligible game before adoption. No primary source reviewed establishes a universal match-ID or account-ID console command for arbitrary private lobbies.

## League live-game lookup

A direct unauthenticated read of Valve's [live league endpoint](https://www.dota2.com/webapi/IDOTA2League/GetLiveGames/v001/) succeeded on the research date and returned 11 `games`. The observed game objects included `league_id`, `server_steam_id`, `match_id`, team names/IDs, `time`, `spectators`, `league_node_id`, and `series_id`. Large IDs arrived as strings. This is current response evidence, not a documented availability promise, and it establishes no private practice-lobby coverage.

`IDOTA2Match_570/GetLiveLeagueGames/v1/` is another candidate league endpoint. Its keyed response was not verified in this research. Valve's unauthenticated supported-API listing returned 27 interfaces and no Dota interface; official documentation states restricted methods need a key in that listing. Do not interpret absence from an unkeyed listing as endpoint removal. [Valve supported-API documentation](https://partner.steamgames.com/doc/webapi/ISteamWebAPIUtil#GetSupportedAPIList), [candidate endpoint](https://api.steampowered.com/IDOTA2Match_570/GetLiveLeagueGames/v1/)

Future league integration could map FDP tournament matches to observed Valve games, retain the exact server identifier, and expose a tested spectator connection. FDP's internal match UUID, Valve `match_id`, `lobby_id`, `server_steam_id`, and `league_id` represent different objects and must be stored separately. For the current manual workflow, use the prestart admission phase plus the stream URL, and describe in-client watching as conditional on actual Dota availability.
