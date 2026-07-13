import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export interface AiToolsVerticalRegistryEntity {
  categories: string[];
  description: string;
  key: string;
  logoUrl: string;
  slug: string;
  title: string;
  type: string;
  websiteUrl: string;
}

export interface AiToolsVerticalRegistryBattle {
  leftKey: string;
  rightKey: string;
  sortOrder: number;
}

export interface AiToolsVerticalRegistry {
  curatedBattles: AiToolsVerticalRegistryBattle[];
  entities: AiToolsVerticalRegistryEntity[];
  siteUrl: string;
  vertical: string;
}

export interface CuratedBattlePairDefinition {
  leftKey: string;
  leftSlug: string;
  rightKey: string;
  rightSlug: string;
  sortOrder: number;
}

let cachedRegistry: AiToolsVerticalRegistry | null = null;
let cachedBattlePairs: CuratedBattlePairDefinition[] | null = null;

export function resolveAiToolsVerticalRegistryPath(): string {
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  return join(moduleDir, "../../../../prisma/seeds/ai-tools-vertical.registry.json");
}

export function loadAiToolsVerticalRegistry(): AiToolsVerticalRegistry {
  if (cachedRegistry) {
    return cachedRegistry;
  }

  const registryPath = resolveAiToolsVerticalRegistryPath();
  const parsed = JSON.parse(readFileSync(registryPath, "utf8")) as AiToolsVerticalRegistry;

  validateRegistry(parsed);

  cachedRegistry = parsed;

  return parsed;
}

export function getCuratedBattlePairDefinitions(): CuratedBattlePairDefinition[] {
  if (cachedBattlePairs) {
    return cachedBattlePairs;
  }

  const registry = loadAiToolsVerticalRegistry();
  const slugByKey = new Map(registry.entities.map((entity) => [entity.key, entity.slug]));

  cachedBattlePairs = registry.curatedBattles
    .slice()
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .flatMap((battle) => {
      const leftSlug = slugByKey.get(battle.leftKey);
      const rightSlug = slugByKey.get(battle.rightKey);

      if (!leftSlug || !rightSlug) {
        return [];
      }

      return [
        {
          leftKey: battle.leftKey,
          leftSlug,
          rightKey: battle.rightKey,
          rightSlug,
          sortOrder: battle.sortOrder
        }
      ];
    });

  return cachedBattlePairs;
}

export function resetCuratedBattlePairsCacheForTests(): void {
  cachedRegistry = null;
  cachedBattlePairs = null;
}

function validateRegistry(registry: AiToolsVerticalRegistry): void {
  if (!Array.isArray(registry.entities) || registry.entities.length === 0) {
    throw new Error("AI tools vertical registry must include entities.");
  }

  if (!Array.isArray(registry.curatedBattles)) {
    throw new Error("AI tools vertical registry must include curatedBattles.");
  }

  const slugSet = new Set<string>();

  for (const entity of registry.entities) {
    if (slugSet.has(entity.slug)) {
      throw new Error(`Duplicate entity slug in AI tools registry: ${entity.slug}`);
    }

    slugSet.add(entity.slug);
  }

  const entityKeys = new Set(registry.entities.map((entity) => entity.key));

  for (const battle of registry.curatedBattles) {
    if (!entityKeys.has(battle.leftKey) || !entityKeys.has(battle.rightKey)) {
      throw new Error(
        `Curated battle references unknown entity keys: ${battle.leftKey} vs ${battle.rightKey}`
      );
    }
  }
}
