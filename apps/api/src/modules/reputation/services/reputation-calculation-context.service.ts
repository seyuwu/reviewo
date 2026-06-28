import { Injectable } from "@nestjs/common";

import { REPUTATION_CALCULATION_VERSION } from "../constants/calculation-versions.js";

@Injectable()
export class ReputationCalculationContext {
  private version = REPUTATION_CALCULATION_VERSION;

  getVersion(): number {
    return this.version;
  }

  setVersion(version: number): void {
    this.version = version;
  }

  resetVersion(): void {
    this.version = REPUTATION_CALCULATION_VERSION;
  }
}
