export class CurrentUserDto {
  avatarUrl!: string | null;
  discordLinked!: boolean;
  displayName!: string;
  email!: string | null;
  id!: string;
  role!: "ADMIN" | "USER";
  status!: string;
  username!: string | null;
}
