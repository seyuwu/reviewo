import { createHash } from "node:crypto";

export type CompanyMember = {
  id: string;
  userId: string | null;
  positionRole: string | null;
  companyConsentVersion?: string | null;
};

export function companyRoster(members: CompanyMember[]) {
  return members
    .map((member) => ({
      membershipId: member.id,
      userId: member.userId,
      positionRole: member.positionRole
    }))
    .sort((left, right) => left.membershipId.localeCompare(right.membershipId));
}

export function companyVersion(members: CompanyMember[]) {
  return createHash("sha256")
    .update(JSON.stringify(companyRoster(members)))
    .digest("hex");
}

export function companyConfirmed(members: CompanyMember[]) {
  const roles = members.map((member) => member.positionRole);
  const version = companyVersion(members);
  return (
    members.length >= 2 &&
    members.length <= 4 &&
    new Set(roles).size === members.length &&
    members.every(
      (member) =>
        member.userId &&
        /^[1-5]$/.test(member.positionRole ?? "") &&
        member.companyConsentVersion === version
    )
  );
}

export function companySnapshotVersion(value: unknown): string | null {
  if (!Array.isArray(value) || value.length < 2 || value.length > 4) return null;
  const members: CompanyMember[] = [];
  for (const row of value) {
    if (
      !row ||
      typeof row !== "object" ||
      typeof row.membershipId !== "string" ||
      typeof row.userId !== "string" ||
      typeof row.positionRole !== "string" ||
      !/^[1-5]$/.test(row.positionRole)
    )
      return null;
    members.push({ id: row.membershipId, userId: row.userId, positionRole: row.positionRole });
  }
  return companyVersion(members);
}
