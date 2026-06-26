import { Module } from "@nestjs/common";

import { RatingsModule } from "../ratings/ratings.module.js";
import { ReviewsModule } from "../reviews/reviews.module.js";
import { TrustController } from "./controllers/trust.controller.js";
import { TRUST_PORT } from "./interfaces/trust.port.js";
import { TrustConfidenceCalculatorService } from "./services/trust-confidence-calculator.service.js";
import { TrustService } from "./services/trust.service.js";

@Module({
  controllers: [TrustController],
  exports: [TRUST_PORT, TrustService],
  imports: [RatingsModule, ReviewsModule],
  providers: [
    TrustConfidenceCalculatorService,
    TrustService,
    {
      provide: TRUST_PORT,
      useExisting: TrustService
    }
  ]
})
export class TrustModule {}
