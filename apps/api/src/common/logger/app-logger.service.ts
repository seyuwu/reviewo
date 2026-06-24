import { ConsoleLogger, Injectable } from "@nestjs/common";

@Injectable()
export class AppLogger extends ConsoleLogger {
  constructor() {
    super("ReviewoApi");
  }
}
