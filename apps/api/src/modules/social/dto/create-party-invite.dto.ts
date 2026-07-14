import { IsUUID } from "class-validator";

export class CreatePartyInviteDto {
  @IsUUID("4")
  userId!: string;
}
