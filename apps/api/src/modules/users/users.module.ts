import { Module } from "@nestjs/common";

import { UsersRepository } from "./repositories/users.repository.js";
import { UsersService } from "./services/users.service.js";

@Module({
  exports: [UsersRepository, UsersService],
  providers: [UsersRepository, UsersService]
})
export class UsersModule {}
