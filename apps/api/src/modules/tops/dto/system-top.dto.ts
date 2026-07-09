export interface SystemTopCatalogItemDto {
  computedAt: string | null;
  description: string;
  slug: string;
  title: string;
}

export interface SystemTopCatalogResponseDto {
  items: SystemTopCatalogItemDto[];
}

export interface SystemTopItemEntityDto {
  canonicalUrl: string | null;
  id: string;
  slug: string;
  title: string;
  type: string;
}

export interface SystemTopItemDto {
  avgScore: number | null;
  entity: SystemTopItemEntityDto;
  position: number;
  score: number;
  votesCount: number | null;
}

export interface SystemTopDetailDto {
  computedAt: string | null;
  description: string;
  items: SystemTopItemDto[];
  slug: string;
  sort: string;
  title: string;
}

export interface EntitySystemTopAppearanceDto {
  computedAt: string;
  isSystemTop: true;
  position: number;
  slug: string;
  title: string;
}

export interface EntitySystemTopsResponseDto {
  items: EntitySystemTopAppearanceDto[];
}
