import { AuthResponseDto } from "./auth-response.dto.js";

export class RecoverAccountResponseDto extends AuthResponseDto {
  recoveryToken!: string;
  recoveryUrl!: string;
}
