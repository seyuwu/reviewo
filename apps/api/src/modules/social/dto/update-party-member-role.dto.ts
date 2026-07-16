import { IsIn } from "class-validator";

export class UpdatePartyMemberRoleDto {
  @IsIn(["OFFICER", "MEMBER"])
  role!: "OFFICER" | "MEMBER";
}
