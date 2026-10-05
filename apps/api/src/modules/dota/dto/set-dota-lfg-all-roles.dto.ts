import { Equals, IsBoolean } from "class-validator";

export class SetDotaLfgAllRolesDto {
  @IsBoolean()
  @Equals(true)
  allRoles!: boolean;
}
