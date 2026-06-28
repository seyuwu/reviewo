import { EntityDto } from "./entity.dto.js";

export class TrustCheckUrlDto {
  canonical!: string;
  input!: string;
}

export class TrustCheckResponseDto {
  entity!: EntityDto;
  mode!: "created" | "existing";
  url!: TrustCheckUrlDto;
}
