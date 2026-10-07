import assert from "node:assert/strict";
import { test } from "node:test";
import { buildBracket, rankEntries, seedOrder, type BracketMatch } from "./tournament-bracket.js";

function seeds(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    entryId: `team-${index + 1}`,
    seed: index + 1,
    averageMmr: 6000 - index * 500
  }));
}

test("MMR ranking is deterministic; unknown MMR goes last and zero is valid", () => {
  const createdAt = new Date(0);
  assert.deepEqual(
    rankEntries([
      { id: "unknown", createdAt, members: [{ mmr: null }, { mmr: 9000 }] },
      { id: "zero", createdAt, members: [{ mmr: 0 }] },
      { id: "b", createdAt, members: [{ mmr: 4000 }, { mmr: 6000 }] },
      { id: "a", createdAt, members: [{ mmr: 5000 }] }
    ]).map((seed) => [seed.entryId, seed.averageMmr]),
    [
      ["a", 5000],
      ["b", 5000],
      ["zero", 0],
      ["unknown", null]
    ]
  );
});

test("top two seeds are in opposite halves and cannot meet before final", () => {
  assert.deepEqual(seedOrder(8), [1, 8, 4, 5, 2, 7, 3, 6]);
  for (const size of [2, 4, 8, 16, 32, 64, 128, 256]) {
    const order = seedOrder(size);
    assert.equal(new Set(order).size, size);
    assert.equal(order.indexOf(1), 0);
    assert.equal(order.indexOf(2), size / 2);
  }
  assert.throws(() => seedOrder(3));
});

test("five teams: highest three seeds get a bye, lower seeds play first", () => {
  const bracket = buildBracket(8, seeds(5), []);
  assert.equal(bracket.ready.length, 1);
  assert.deepEqual([bracket.ready[0]!.entryAId, bracket.ready[0]!.entryBId], ["team-4", "team-5"]);
  assert.equal(bracket.nodes.filter((node) => node.status === "BYE").length, 3);
  assert.equal(bracket.complete, false);
});

test("all team counts advance to one final and a confirmed podium without duplicate pairings", () => {
  for (let count = 2; count <= 256; count++) {
    const size = 2 ** Math.ceil(Math.log2(count));
    const matches: BracketMatch[] = [];
    let bracket = buildBracket(size, seeds(count), matches);
    for (let guard = 0; !bracket.complete && guard < 12; guard++) {
      assert.ok(bracket.ready.length > 0, `stalled at ${count} teams`);
      const playing = new Set<string>();
      for (const node of bracket.ready) {
        assert.ok(!playing.has(node.entryAId!));
        assert.ok(!playing.has(node.entryBId!));
        playing.add(node.entryAId!);
        playing.add(node.entryBId!);
        assert.notEqual(node.entryAId, node.entryBId);
        matches.push({
          id: node.key,
          bracketKind: node.kind,
          roundNumber: node.roundNumber,
          matchNumber: node.matchNumber,
          entryAId: node.entryAId!,
          entryBId: node.entryBId!,
          status: "COMPLETED",
          winnerEntryId:
            Number(node.entryAId!.split("-")[1]) < Number(node.entryBId!.split("-")[1])
              ? node.entryAId
              : node.entryBId
        });
      }
      bracket = buildBracket(size, seeds(count), matches);
    }
    assert.equal(bracket.complete, true, `${count} teams`);
    assert.equal(matches.filter((match) => match.bracketKind === "MAIN").length, count - 1);
    assert.equal(
      matches.filter((match) => match.bracketKind === "BRONZE").length,
      count >= 4 ? 1 : 0
    );
    assert.equal(bracket.podium[0], "team-1");
    assert.equal(bracket.podium[1], "team-2");
    assert.equal(bracket.podium[2], count > 2 ? "team-3" : null);
    assert.equal(bracket.ready.length, 0);
  }
});

test("final alone does not complete four-team tournament; disputes never advance", () => {
  const entries = seeds(4);
  const semi = buildBracket(4, entries, []).ready;
  const matches: BracketMatch[] = semi.map((node) => ({
    id: node.key,
    bracketKind: "MAIN",
    roundNumber: 1,
    matchNumber: node.matchNumber,
    entryAId: node.entryAId!,
    entryBId: node.entryBId!,
    winnerEntryId: node.entryAId!,
    status: "DISPUTED"
  }));
  assert.equal(buildBracket(4, entries, matches).ready.length, 0);
  matches.forEach((match) => {
    match.status = "COMPLETED";
  });
  const next = buildBracket(4, entries, matches);
  assert.equal(next.ready.length, 2);
  const final = next.ready.find((node) => node.kind === "MAIN")!;
  matches.push({
    id: final.key,
    bracketKind: "MAIN",
    roundNumber: 2,
    matchNumber: 1,
    entryAId: final.entryAId!,
    entryBId: final.entryBId!,
    status: "COMPLETED",
    winnerEntryId: final.entryAId
  });
  assert.equal(buildBracket(4, entries, matches).complete, false);
});

test("double elimination supports every team count and ends after one grand final", () => {
  for (let count = 2; count <= 256; count++) {
      const size = 2 ** Math.ceil(Math.log2(count));
      const matches: BracketMatch[] = [];
      const losses = new Map<string, number>();
      let bracket = buildBracket(size, seeds(count), matches, "DOUBLE_ELIMINATION");
      for (let guard = 0; !bracket.complete && guard < 30; guard++) {
        assert.ok(bracket.ready.length, "Double bracket stalled: " + count);
        const playing = new Set<string>();
        for (const node of bracket.ready) {
          const a = node.entryAId!;
          const b = node.entryBId!;
          assert.notEqual(a, b);
          assert.ok(!playing.has(a) && !playing.has(b), "A team has two simultaneous matches");
          assert.ok((losses.get(a) ?? 0) < 2 && (losses.get(b) ?? 0) < 2);
          playing.add(a); playing.add(b);
          const winner = Number(a.split("-")[1]) < Number(b.split("-")[1]) ? a : b;
          const loser = winner === a ? b : a;
          losses.set(loser, (losses.get(loser) ?? 0) + 1);
          matches.push({
            id: node.key, bracketKind: node.kind, roundNumber: node.roundNumber,
            matchNumber: node.matchNumber, entryAId: a, entryBId: b, status: "COMPLETED",
            winnerEntryId: winner
          });
        }
        bracket = buildBracket(size, seeds(count), matches, "DOUBLE_ELIMINATION");
      }
      assert.equal(bracket.complete, true, "Team count: " + count);
      assert.equal(new Set(matches.map((match) => match.id)).size, matches.length);
      assert.equal(matches.length, 2 * count - 2);
      assert.equal(matches.filter((match) => match.bracketKind === "BRONZE").length, 0);
      assert.equal(bracket.nodes.filter((node) => node.kind === "GRAND_FINAL").length, 1);
      assert.equal(bracket.podium[0], "team-1");
      assert.equal(bracket.podium[1], "team-2");
      assert.equal(bracket.podium[2], count > 2 ? "team-3" : null);
      for (const team of seeds(count))
        assert.equal(losses.get(team.entryId) ?? 0, team.entryId === bracket.podium[0] ? 0 : 2);
      assert.equal(bracket.ready.length, 0);
  }
});

test("double bracket disputes block dependent matches and lower drop-ins identify their sources", () => {
  const first = buildBracket(4, seeds(4), [], "DOUBLE_ELIMINATION");
  assert.equal(first.ready.length, 2);
  assert.equal(first.nodes.find((node) => node.kind === "LOWER")!.sourceAResult, "LOSER");
  const disputed = first.ready.map((node) => ({
    id: node.key, bracketKind: node.kind, roundNumber: node.roundNumber, matchNumber: node.matchNumber,
    entryAId: node.entryAId!, entryBId: node.entryBId!, status: "DISPUTED", winnerEntryId: node.entryAId
  }));
  const blocked = buildBracket(4, seeds(4), disputed, "DOUBLE_ELIMINATION");
  assert.equal(blocked.complete, false);
  assert.equal(blocked.ready.length, 0);
  assert.throws(() => buildBracket(4, seeds(4), [], "unknown"));
});
