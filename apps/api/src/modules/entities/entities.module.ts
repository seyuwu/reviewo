import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { UsersModule } from "../users/users.module.js";
import { EntitiesController } from "./controllers/entities.controller.js";
import { ENTITIES_PORT } from "./interfaces/entities.port.js";
import { EntitiesRepository } from "./repositories/entities.repository.js";
import { EntitiesService } from "./services/entities.service.js";

@Module({
  controllers: [EntitiesController],
  exports: [ENTITIES_PORT, EntitiesService],
  imports: [AuthModule, UsersModule],
  providers: [
    EntitiesRepository,
    EntitiesService,
    {
      provide: ENTITIES_PORT,
      useExisting: EntitiesService
    }
  ]
})
export class EntitiesModule {}
