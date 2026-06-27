export interface ExtensionUrlData {
  canonical: string;
  input: string;
}

export interface ExtensionEntitySummary {
  canonicalUrl: string | null;
  description: string | null;
  id: string;
  slug: string;
  title: string;
  type: string;
}

export interface ExtensionRatingAggregate {
  avgScore: number;
  entityId: string;
  updatedAt: string;
  votesCount: number;
}

export interface ExtensionTrustConfidence {
  confidence: number;
}

export interface ExtensionWebLink {
  entityPagePath: string;
}

export interface ExtensionResolveFoundResponse {
  entity: ExtensionEntitySummary;
  rating: ExtensionRatingAggregate;
  status: "found";
  trust: ExtensionTrustConfidence;
  url: ExtensionUrlData;
  web: ExtensionWebLink;
}

export interface ExtensionResolveNotFoundResponse {
  canCreateEntity: true;
  status: "not_found";
  url: ExtensionUrlData;
}

export type ExtensionResolveResponse =
  | ExtensionResolveFoundResponse
  | ExtensionResolveNotFoundResponse;
