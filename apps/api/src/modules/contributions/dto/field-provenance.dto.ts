export class FieldProvenanceDto {
  field!: string;
  source!: "community" | "author" | "system";
  contributionId!: string | null;
  confirmedAt!: string;
  votersCount!: number;
}

export class FieldProvenanceListResponseDto {
  items!: FieldProvenanceDto[];
}
