import { CurrentUserDto } from "./current-user.dto.js";

export class AuthResponseDto {
  accessToken!: string;
  expiresIn!: number;
  tokenType!: "Bearer";
  user!: CurrentUserDto;
}
