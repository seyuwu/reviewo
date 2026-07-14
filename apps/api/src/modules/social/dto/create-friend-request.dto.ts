import { IsUUID } from "class-validator";

export class CreateFriendRequestDto {
  @IsUUID("4")
  userId!: string;
}
