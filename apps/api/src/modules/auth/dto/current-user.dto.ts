export class CurrentUserDto {
  avatarUrl!: string | null;
  displayName!: string;
  email!: string | null;
  id!: string;
  role!: "ADMIN" | "USER";
  status!: string;
  username!: string | null;
}
