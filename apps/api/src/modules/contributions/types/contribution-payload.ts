export interface FieldChangePayload {
  newValue: string | null;
  oldValue: string | null;
}

export interface MergeEntityPayload {
  reason?: string;
  sourceEntityId: string;
  sourceEntityTitle?: string | null;
  targetEntityId: string;
  targetEntityTitle?: string | null;
}

export type ContributionPayload = FieldChangePayload | MergeEntityPayload;

export function isFieldChangePayload(payload: unknown): payload is FieldChangePayload {
  return (
    typeof payload === "object" &&
    payload !== null &&
    "newValue" in payload &&
    "oldValue" in payload
  );
}

export function isIncomingFieldChangePayload(
  payload: unknown
): payload is Pick<FieldChangePayload, "newValue"> {
  return typeof payload === "object" && payload !== null && "newValue" in payload;
}

export function isMergeEntityPayload(payload: unknown): payload is MergeEntityPayload {
  return (
    typeof payload === "object" &&
    payload !== null &&
    "sourceEntityId" in payload &&
    "targetEntityId" in payload
  );
}
