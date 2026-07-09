import { IsIn } from "class-validator";

export class ResolveContributionDto {
  @IsIn(["apply", "reject"])
  action!: "apply" | "reject";
}
