import { Injectable } from "@nestjs/common";
import { EventEmitter } from "node:events";

@Injectable()
export class TournamentRoomEvents {
  private readonly emitter = new EventEmitter();
  changed(entryId: string) { this.emitter.emit("changed", entryId); }
  matchChanged(matchId: string) { this.emitter.emit("matchChanged", matchId); }
  subscribeMatch(listener: (matchId: string) => void) {
    this.emitter.on("matchChanged", listener);
    return () => { this.emitter.off("matchChanged", listener); };
  }
  subscribe(listener: (entryId: string) => void) {
    this.emitter.on("changed", listener);
    return () => { this.emitter.off("changed", listener); };
  }
}
