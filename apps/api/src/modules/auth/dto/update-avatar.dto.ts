import { IsString, Matches, MaxLength } from "class-validator";

const AVATAR_DATA_URL_PATTERN =
  /^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/;

export class UpdateAvatarDto {
  @IsString()
  @MaxLength(350_000)
  @Matches(AVATAR_DATA_URL_PATTERN, {
    message: "Avatar must be a jpeg, png, or webp data URL"
  })
  imageDataUrl!: string;
}
