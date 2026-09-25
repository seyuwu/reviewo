import { CurrentUserDto } from "./current-user.dto.js";

export class AuthResponseDto {
  accessToken!: string;
  expiresIn!: number;
  /** Opaque rotating refresh token. Only returned when issued (login, register, refresh). */
  refreshToken?: string;
  tokenType!: "Bearer";
  user!: CurrentUserDto;
}
