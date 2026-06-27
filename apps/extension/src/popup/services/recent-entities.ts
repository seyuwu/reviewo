import type { RecentEntityRecord } from "../types.js";

const RECENT_ENTITIES_KEY = "reviewo.recentEntities";
const MAX_RECENT_ENTITIES = 5;

export async function listRecentEntities(): Promise<RecentEntityRecord[]> {
  const stored = await chrome.storage.local.get(RECENT_ENTITIES_KEY);
  const records = stored[RECENT_ENTITIES_KEY];

  if (!Array.isArray(records)) {
    return [];
  }

  return records.filter(isRecentEntityRecord);
}

export async function rememberRecentEntity(
  record: Omit<RecentEntityRecord, "visitedAt">
): Promise<void> {
  const existing = await listRecentEntities();
  const nextRecord: RecentEntityRecord = {
    ...record,
    visitedAt: new Date().toISOString()
  };

  const withoutDuplicate = existing.filter((item) => item.id !== record.id);
  const next = [nextRecord, ...withoutDuplicate].slice(0, MAX_RECENT_ENTITIES);

  await chrome.storage.local.set({
    [RECENT_ENTITIES_KEY]: next
  });
}

function isRecentEntityRecord(value: unknown): value is RecentEntityRecord {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as RecentEntityRecord;

  return (
    typeof record.id === "string" &&
    typeof record.title === "string" &&
    typeof record.slug === "string" &&
    typeof record.entityPagePath === "string" &&
    typeof record.visitedAt === "string" &&
    (record.canonicalUrl === null || typeof record.canonicalUrl === "string")
  );
}
