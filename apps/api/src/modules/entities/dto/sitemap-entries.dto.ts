export class SitemapEntryDto {
  id!: string;
  updatedAt!: string;
}

export class SitemapEntriesResponseDto {
  items!: SitemapEntryDto[];
  limit!: number;
  offset!: number;
  total!: number;
}
