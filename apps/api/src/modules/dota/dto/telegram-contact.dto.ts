import { IsBoolean } from "class-validator";

export class UpdateTelegramContactVisibilityDto {
  @IsBoolean()
  visible!: boolean;
}

export interface TelegramContactResponse {
  username: string | null;
  visible: boolean;
  isOwner: boolean;
  isAdminView: boolean;
}
