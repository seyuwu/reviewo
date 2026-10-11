import { Type } from "class-transformer";
import { ArrayMaxSize, ArrayUnique, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, ValidateNested } from "class-validator";

export class RoomBotDto {
  @Matches(/^\d{5,16}$/) botId!: string;
  @IsOptional() @Matches(/^\d+(?:\.\d+)?$/) lastPolledAt?: string;
}
export class RoomAdminDto extends RoomBotDto {
  @Matches(/^\d{1,16}$/) adminId!: string;
}
export class RegisterRoomDto extends RoomAdminDto {
  @Matches(/^-100\d{5,16}$/) chatId!: string;
  @IsString() @MaxLength(128) title!: string;
  @IsArray() @ArrayMaxSize(50) @ArrayUnique() @Matches(/^\d{1,16}$/, { each: true }) staffIds!: string[];
}
export class PoolCapacityDto extends RoomAdminDto {
  @IsInt() @Min(0) @Max(500) capacity!: number;
}
export class RoomAdminActionDto extends RoomAdminDto {
  @IsIn(["enable", "disable", "remove", "retry", "confirm-clean"]) action!: string;
  @IsOptional() @IsArray() @ArrayMaxSize(50) @ArrayUnique() @Matches(/^\d{1,16}$/, { each: true }) staffIds?: string[];
}
export class ReserveRoomDto extends RoomBotDto {
  @Matches(/^\d{1,16}$/) userId!: string;
  @IsString() @MaxLength(120) slug!: string;
}
export class RoomLeaseDto extends RoomBotDto {
  @IsUUID("4") leaseToken!: string;
  @IsInt() @Min(1) generation!: number;
}
export class RoomReportDto extends RoomLeaseDto {
  @IsIn(["prepared", "rotated", "link-revoked", "member-removed", "member-unbanned", "admitting", "joined", "card", "card-pinned", "closed", "review", "retry"]) event!: string;
  @IsOptional() @Matches(/^https:\/\/t\.me\/\+[A-Za-z0-9_-]+$/) inviteLink?: string;
  @IsOptional() @Matches(/^\d{1,16}$/) userId?: string;
  @IsOptional() @IsBoolean() ownedBan?: boolean;
  @IsOptional() @IsInt() @Min(1) purgedBefore?: number;
  @IsOptional() @IsInt() @Min(1) messageId?: number;
  @IsOptional() @IsInt() @Min(0) cardJoinVersion?: number;
  @IsOptional() @IsInt() @Min(0) @Max(86400) retrySeconds?: number;
  @IsOptional() @IsString() @MaxLength(160) reason?: string;
}
export class RoomAdmissionDto extends RoomBotDto {
  @Matches(/^\d{1,16}$/) userId!: string;
  @IsString() @MaxLength(256) inviteLink!: string;
  @IsOptional() @IsBoolean() ready?: boolean;
  @IsOptional() @IsInt() @Min(1) generation?: number;
}
export class RoomMessageDto {
  @Matches(/^-100\d{5,16}$/) chatId!: string;
  @IsInt() @Min(1) messageId!: number;
  @IsInt() @Min(1) sentAt!: number;
  @IsOptional() @IsBoolean() service?: boolean;
  @IsOptional() @Matches(/^\d{1,16}$/) userId?: string;
}
export class RoomMessagesDto extends RoomBotDto {
  @IsArray() @ArrayMaxSize(250) @ValidateNested({ each: true }) @Type(() => RoomMessageDto) messages!: RoomMessageDto[];
}
export class RoomDeletedDto extends RoomLeaseDto {
  @IsArray() @ArrayMaxSize(100) @ArrayUnique() @IsInt({ each: true }) @Min(1, { each: true }) messageIds!: number[];
}
export class RoomPresenceDto extends RoomBotDto {
  @Matches(/^-100\d{5,16}$/) chatId!: string;
  @Matches(/^\d{1,16}$/) userId!: string;
  @IsIn(["joined", "left"]) event!: string;
  @IsOptional() @Matches(/^\d{1,16}$/) actorId?: string;
  @IsOptional() @IsIn(["creator", "administrator", "member", "restricted", "left", "kicked"]) status?: string;
  @IsOptional() @IsBoolean() wasPresent?: boolean;
  @IsOptional() @IsInt() @Min(1) sentAt?: number;
  @IsOptional() @IsInt() @Min(0) updateId?: number;
}
