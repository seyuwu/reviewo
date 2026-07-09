export class TopCategorySummaryDto {
  slug!: string;
  title!: string;
}

export class TopCategoryDto {
  id!: string;
  slug!: string;
  sortOrder!: number;
  title!: string;
}

export class TopCategoryListResponseDto {
  items!: TopCategoryDto[];
}
