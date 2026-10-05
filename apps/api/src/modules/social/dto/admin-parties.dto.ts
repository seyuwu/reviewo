import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsUUID, Max, Min } from "class-validator";

export class ListAdminPartiesQueryDto {
  @IsOptional()
  @IsIn(["PARTY", "TEAM"])
  kind?: "PARTY" | "TEAM";

  @IsOptional()
  @IsUUID()
  before?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class ListAdminPartyChatQueryDto {
  @IsOptional()
  @IsUUID()
  before?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export interface AdminPartySummaryDto {
  createdAt: string;
  expiresAt: string | null;
  id: string;
  joinMode: "OPEN" | "CONFIRM";
  kind: "PARTY" | "TEAM";
  maxMembers: number;
  members: Array<{
    displayName: string;
    positionRole: string | null;
    role: "OWNER" | "OFFICER" | "MEMBER";
    userId: string;
  }>;
  name: string;
  slug: string;
  visibility: "PUBLIC" | "PRIVATE";
}

export interface AdminPartiesPageDto {
  items: AdminPartySummaryDto[];
  nextCursor: string | null;
  total: number;
}
