import { IsString, MaxLength, MinLength } from "class-validator";

export class SitePresenceHeartbeatDto {
  @IsString()
  @MinLength(8)
  @MaxLength(64)
  visitorId!: string;
}
