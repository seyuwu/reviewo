import { IsIn, IsString, MaxLength } from "class-validator";

export class RecordSpotlightPlacementEventDto {
  @IsIn(["impression", "click"])
  eventType!: "click" | "impression";

  @IsString()
  @MaxLength(120)
  viewerKey!: string;
}

export class RecordSpotlightPlacementEventResponseDto {
  recorded!: boolean;
}
