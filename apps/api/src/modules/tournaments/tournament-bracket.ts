export interface BracketSeed {
  entryId: string;
  seed: number;
  averageMmr: number | null;
}

export interface BracketMatch {
  id: string;
  bracketKind: string;
  roundNumber: number;
  matchNumber: number;
  entryAId: string;
  entryBId: string;
  status: string;
  winnerEntryId: string | null;
}

export interface BracketNode {
  key: string;
  kind: "MAIN" | "BRONZE" | "LOWER" | "GRAND_FINAL";
  roundNumber: number;
  matchNumber: number;
  entryAId: string | null;
  entryBId: string | null;
  sourceA: string | null;
  sourceB: string | null;
  sourceAResult: "WINNER" | "LOSER" | null;
  sourceBResult: "WINNER" | "LOSER" | null;
  matchId: string | null;
  status: string;
  winnerEntryId: string | null;
  loserEntryId: string | null;
  resolved: boolean;
}

export function seedOrder(size: number): number[] {
  if (size < 2 || size > 256 || (size & (size - 1)) !== 0) {
    throw new Error("Bracket size must be a power of two between 2 and 256");
  }
  let order = [1, 2];
  while (order.length < size) {
    const nextSize = order.length * 2;
    order = order.flatMap((seed) => [seed, nextSize + 1 - seed]);
  }
  return order;
}

export function bracketRoundOffset(size: number, kind: string, roundNumber: number) {
  const rounds = Math.log2(size);
  return kind === "MAIN" ? rounds - roundNumber
    : kind === "LOWER" ? 2 * (rounds - 1) - roundNumber : 0;
}

export function bracketPlanningNodes(size: number, format: string) {
  const seeds = Array.from({ length: size }, (_, index) => ({
    entryId: "seed-" + index, seed: index + 1, averageMmr: null
  }));
  const nodes = buildBracket(size, seeds, [], format).nodes.map((node) => ({
    ...node, entryAId: null, entryBId: null, status: "WAITING"
  }));
  return nodes;
}

export function rankEntries<
  T extends {
    id: string;
    createdAt: Date;
    members: Array<{ mmr: number | null }>;
  }
>(entries: T[]): BracketSeed[] {
  return entries
    .map((entry) => ({
      entryId: entry.id,
      createdAt: entry.createdAt.getTime(),
      averageMmr:
        entry.members.length > 0 && entry.members.every((member) => member.mmr !== null)
          ? entry.members.reduce((sum, member) => sum + (member.mmr ?? 0), 0) / entry.members.length
          : null
    }))
    .sort((a, b) => {
      if (a.averageMmr === null && b.averageMmr !== null) return 1;
      if (b.averageMmr === null && a.averageMmr !== null) return -1;
      return (
        (b.averageMmr ?? 0) - (a.averageMmr ?? 0) ||
        a.createdAt - b.createdAt ||
        a.entryId.localeCompare(b.entryId)
      );
    })
    .map(({ entryId, averageMmr }, index) => ({ entryId, averageMmr, seed: index + 1 }));
}

export function buildBracket(size: number, seeds: BracketSeed[], matches: BracketMatch[], format = "SINGLE_ELIMINATION") {
  if (!["SINGLE_ELIMINATION", "DOUBLE_ELIMINATION"].includes(format))
    throw new Error("Unknown bracket format");
  const slots = seedOrder(size).map(
    (seed) => seeds.find((item) => item.seed === seed)?.entryId ?? null
  );
  const nodes: BracketNode[] = [];
  const readyKeys = new Set<string>();
  const byKey = new Map(
    matches.map((match) => [
      `${match.bracketKind}-${match.roundNumber}-${match.matchNumber}`,
      match
    ])
  );
  const makeNode = (
    kind: BracketNode["kind"],
    roundNumber: number,
    matchNumber: number,
    entryAId: string | null,
    entryBId: string | null,
    sourceA: string | null,
    sourceB: string | null,
    feedsResolved: boolean,
    sourceAResult: BracketNode["sourceAResult"] = sourceA ? (kind === "BRONZE" ? "LOSER" : "WINNER") : null,
    sourceBResult: BracketNode["sourceBResult"] = sourceB ? (kind === "BRONZE" ? "LOSER" : "WINNER") : null
  ): BracketNode => {
    const key = `${kind}-${roundNumber}-${matchNumber}`;
    const match = byKey.get(key);
    const validResult =
      match?.status === "COMPLETED" &&
      (match.winnerEntryId === entryAId || match.winnerEntryId === entryBId) &&
      !!match.winnerEntryId;
    const bye = !match && feedsResolved && (!entryAId || !entryBId);
    const winnerEntryId = validResult ? match!.winnerEntryId : bye ? (entryAId ?? entryBId) : null;
    const node: BracketNode = {
      key,
      kind,
      roundNumber,
      matchNumber,
      entryAId,
      entryBId,
      sourceA,
      sourceB,
      sourceAResult,
      sourceBResult,
      matchId: match?.id ?? null,
      status: match?.status ?? (bye ? "BYE" : "WAITING"),
      winnerEntryId,
      loserEntryId: validResult ? (winnerEntryId === entryAId ? entryBId : entryAId) : null,
      resolved: !!validResult || bye
    };
    nodes.push(node);
    if (!match && feedsResolved && entryAId && entryBId) readyKeys.add(key);
    return node;
  };
  let previous: BracketNode[] = [];
  const rounds = Math.log2(size);
  let semifinals: BracketNode[] = [];
  for (let round = 1; round <= rounds; round++) {
    const current: BracketNode[] = [];
    for (let index = 0; index < size / 2 ** round; index++) {
      const a = previous[index * 2]!;
      const b = previous[index * 2 + 1]!;
      current.push(
        makeNode(
          "MAIN",
          round,
          index + 1,
          round === 1 ? (slots[index * 2] ?? null) : a.winnerEntryId,
          round === 1 ? (slots[index * 2 + 1] ?? null) : b.winnerEntryId,
          round === 1 ? null : a.key,
          round === 1 ? null : b.key,
          round === 1 || (a.resolved && b.resolved)
        )
      );
    }
    if (current.length === 2) semifinals = current;
    previous = current;
  }
  const final = previous[0]!;
  if (format === "DOUBLE_ELIMINATION") {
    const upperRounds = Array.from({ length: rounds }, (_, index) =>
      nodes.filter((node) => node.kind === "MAIN" && node.roundNumber === index + 1));
    let lower: BracketNode[] = [];
    if (rounds > 1) {
      const first = upperRounds[0]!;
      for (let index = 0; index < first.length / 2; index++) {
        const a = first[index * 2]!;
        const b = first[index * 2 + 1]!;
        lower.push(makeNode("LOWER", 1, index + 1, a.loserEntryId, b.loserEntryId,
          a.key, b.key, a.resolved && b.resolved, "LOSER", "LOSER"));
      }
      for (let upperRound = 2; upperRound <= rounds; upperRound++) {
        if (upperRound > 2) {
          const merged: BracketNode[] = [];
          for (let index = 0; index < lower.length / 2; index++) {
            const a = lower[index * 2]!;
            const b = lower[index * 2 + 1]!;
            merged.push(makeNode("LOWER", upperRound * 2 - 3, index + 1,
              a.winnerEntryId, b.winnerEntryId, a.key, b.key, a.resolved && b.resolved));
          }
          lower = merged;
        }
        const drops = upperRounds[upperRound - 1]!;
        lower = lower.map((a, index) => {
          // Cross the drop-ins when possible to postpone immediate rematches.
          const b = drops[drops.length > 1 ? index ^ 1 : index]!;
          return makeNode("LOWER", upperRound * 2 - 2, index + 1,
            a.winnerEntryId, b.loserEntryId, a.key, b.key, a.resolved && b.resolved,
            "WINNER", "LOSER");
        });
      }
    }
    const lowerFinal = lower[0] ?? null;
    const grandFinal = makeNode("GRAND_FINAL", 1, 1, final.winnerEntryId,
      lowerFinal ? lowerFinal.winnerEntryId : final.loserEntryId,
      final.key, lowerFinal?.key ?? final.key,
      final.resolved && (!lowerFinal || lowerFinal.resolved), "WINNER",
      lowerFinal ? "WINNER" : "LOSER");
    return {
      nodes,
      ready: nodes.filter((node) => readyKeys.has(node.key)),
      complete: grandFinal.resolved && !!grandFinal.winnerEntryId,
      podium: [grandFinal.winnerEntryId, grandFinal.loserEntryId, lowerFinal?.loserEntryId ?? null]
    };
  }
  const bronze =
    semifinals.length === 2
      ? makeNode(
          "BRONZE",
          rounds + 1,
          1,
          semifinals[0]!.loserEntryId,
          semifinals[1]!.loserEntryId,
          semifinals[0]!.key,
          semifinals[1]!.key,
          semifinals.every((node) => node.resolved)
        )
      : null;
  return {
    nodes,
    ready: nodes.filter(
      (node) =>
        !node.matchId &&
        node.entryAId &&
        node.entryBId &&
        nodes
          .filter(
            (previousNode) =>
              previousNode.kind === "MAIN" &&
              previousNode.roundNumber ===
                (node.kind === "BRONZE" ? rounds - 1 : node.roundNumber - 1)
          )
          .every((previousNode) => previousNode.resolved)
    ),
    complete: final.resolved && !!final.winnerEntryId && (!bronze || bronze.resolved),
    podium: [final.winnerEntryId, final.loserEntryId, bronze?.winnerEntryId ?? null]
  };
}
