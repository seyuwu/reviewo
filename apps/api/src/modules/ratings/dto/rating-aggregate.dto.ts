export interface RatingDistributionDto {
  "1": number;
  "2": number;
  "3": number;
  "4": number;
  "5": number;
}

export class RatingAggregateDto {
  avgScore!: number;
  distribution!: RatingDistributionDto;
  entityId!: string;
  updatedAt!: string;
  votesCount!: number;
}
