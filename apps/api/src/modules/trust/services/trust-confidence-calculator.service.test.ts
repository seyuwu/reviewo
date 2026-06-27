import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { TrustConfidenceCalculatorService } from "./trust-confidence-calculator.service.js";

describe("TrustConfidenceCalculatorService", () => {
  const calculator = new TrustConfidenceCalculatorService();

  it("returns zero confidence with no ratings or reviews", () => {
    assert.equal(calculator.calculate({ reviewCount: 0, votesCount: 0 }), 0);
  });

  it("caps rating contribution at 100 votes", () => {
    assert.equal(calculator.calculate({ reviewCount: 0, votesCount: 100 }), 0.9);
    assert.equal(calculator.calculate({ reviewCount: 0, votesCount: 200 }), 0.9);
  });

  it("caps review contribution at 20 reviews", () => {
    assert.equal(calculator.calculate({ reviewCount: 20, votesCount: 0 }), 0.1);
    assert.equal(calculator.calculate({ reviewCount: 50, votesCount: 0 }), 0.1);
  });

  it("combines capped rating and review contributions", () => {
    assert.equal(calculator.calculate({ reviewCount: 10, votesCount: 50 }), 0.5);
    assert.equal(calculator.calculate({ reviewCount: 20, votesCount: 100 }), 1);
  });

  it("rounds confidence to two decimals", () => {
    assert.equal(calculator.calculate({ reviewCount: 1, votesCount: 1 }), 0.01);
  });
});
