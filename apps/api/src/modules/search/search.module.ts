import { Module } from "@nestjs/common";

import { EntitiesModule } from "../entities/entities.module.js";
import { SearchController } from "./controllers/search.controller.js";
import { SearchService } from "./services/search.service.js";

@Module({
  controllers: [SearchController],
  imports: [EntitiesModule],
  providers: [SearchService]
})
export class SearchModule {}
