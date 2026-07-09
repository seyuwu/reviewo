export class DuplicateSuggestionDto {
  entity!: {
    canonicalUrl: string | null;
    id: string;
    slug: string;
    title: string;
  };
  matchPercent!: number;
  reasons!: string[];
}

export class DuplicateSuggestionsResponseDto {
  items!: DuplicateSuggestionDto[];
}
