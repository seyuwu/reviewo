export class ContributeQueueItemDto {
  entityId?: string;
  href!: string;
  leftSlug?: string;
  pairSlug?: string;
  rightSlug?: string;
  slug?: string;
  title!: string;
  topId?: string;
  totalVotes?: number;
  viewerHasRated?: boolean;
}

export class ContributeQueueDto {
  count!: number;
  items!: ContributeQueueItemDto[];
  key!: string;
}

export class ContributeQueuesResponseDto {
  queues!: ContributeQueueDto[];
}
