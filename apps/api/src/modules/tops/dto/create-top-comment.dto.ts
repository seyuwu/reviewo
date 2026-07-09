import { IsString, MaxLength, MinLength } from "class-validator";

import { MAX_TOP_COMMENT_LENGTH } from "../constants/top-limits.js";

export class CreateTopCommentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_TOP_COMMENT_LENGTH)
  text!: string;
}
