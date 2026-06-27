import { ConsoleLogger, Injectable } from "@nestjs/common";

@Injectable()
export class AppLogger extends ConsoleLogger {
  constructor() {
    super("ReviewoApi");

    const nodeEnvironment = process.env["NODE_ENV"] ?? "development";

    if (nodeEnvironment === "production") {
      this.setLogLevels(["log", "warn", "error", "fatal"]);
    }
  }
}
