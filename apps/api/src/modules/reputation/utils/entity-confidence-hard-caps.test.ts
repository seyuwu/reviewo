import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  calculateEntityConfidenceHardCap,
  calculateUniqueRatioFactor,
  HARD_CAP_ANOMALY,
  HARD_CAP_NEW_ACCOUNT_SHARE,
  HARD_CAP_UNIQUE_RATIO
} from "./entity-confidence-hard-caps.js";

describe("entity-confidence-hard-caps", () => {
  it("returns full cap when no signals fire", () => {
    const result = calculateEntityConfidenceHardCap({
      anomalyScore: 0.1,
      newAccountShare: 0.2,
      platformUserCount: 1000,
      uniqueRatersCount: 80,
      votesCount: 100
    });

    assert.equal(result.hardCap, 1);
    assert.equal(result.appliedCaps.length, 0);
    assert.ok(result.uniqueRatioFactor > 0.9);
  });

  it("caps confidence when anomaly score is elevated", () => {
    const result = calculateEntityConfidenceHardCap({
      anomalyScore: 0.8,
      uniqueRatersCount: 80,
      votesCount: 100
    });

    assert.equal(result.hardCap, HARD_CAP_ANOMALY);
    assert.deepEqual(result.appliedCaps, ["ANOMALY"]);
  });

  it("caps confidence when unique ratio is low", () => {
    const result = calculateEntityConfidenceHardCap({
      anomalyScore: 0,
      uniqueRatersCount: 5,
      votesCount: 100
    });

    assert.equal(result.hardCap, HARD_CAP_UNIQUE_RATIO);
    assert.deepEqual(result.appliedCaps, ["UNIQUE_RATIO"]);
    assert.equal(calculateUniqueRatioFactor(5, 100), result.uniqueRatioFactor);
  });

  it("applies new-account cap only after minimum sample gates", () => {
    const gatedOff = calculateEntityConfidenceHardCap({
      anomalyScore: 0,
      newAccountShare: 0.9,
      uniqueRatersCount: 3,
      votesCount: 12
    });
    const gatedOn = calculateEntityConfidenceHardCap({
      anomalyScore: 0,
      newAccountShare: 0.9,
      uniqueRatersCount: 6,
      votesCount: 12
    });

    assert.equal(gatedOff.hardCap, 1);
    assert.equal(gatedOn.hardCap, HARD_CAP_NEW_ACCOUNT_SHARE);
  });
});
