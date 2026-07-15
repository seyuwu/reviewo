import { AuthResponseDto } from "../../auth/dto/auth-response.dto.js";
import type { DotaProfileResponseDto } from "./dota-profile-response.dto.js";

export class GuestDotaProfileCreateResponseDto extends AuthResponseDto {
  profile!: DotaProfileResponseDto;
  recoveryToken!: string;
  recoveryUrl!: string;
}
