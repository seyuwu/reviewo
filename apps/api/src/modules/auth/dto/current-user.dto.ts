export class CurrentUserDto {
  avatarUrl!: string | null;
  discordLinked!: boolean;
  displayName!: string;
  email!: string | null;
  id!: string;
  role!: "ADMIN" | "TOURNAMENT_MODERATOR" | "USER";
  status!: string;
  telegramLinked!: boolean;
  username!: string | null;
}
