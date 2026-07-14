export type FriendshipStatusDto = "none" | "outgoing" | "incoming" | "friends" | "self";

export class FriendUserDto {
  displayName!: string;
  dotaSlug!: string | null;
  friendshipId!: string | null;
  id!: string;
}

export class FriendshipRequestDto {
  createdAt!: string;
  id!: string;
  otherUser!: FriendUserDto;
  direction!: "incoming" | "outgoing";
}

export class FriendsListResponseDto {
  friends!: FriendUserDto[];
}

export class FriendshipRequestsResponseDto {
  incoming!: FriendshipRequestDto[];
  outgoing!: FriendshipRequestDto[];
}
