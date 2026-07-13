import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createSeedPrismaClient } from "./create-prisma-client.mjs";

const COMPARE_PAIR_SEPARATOR = "-vs-";

function buildCompareSlug(leftSlug, rightSlug) {
  return `${leftSlug.trim().toLowerCase()}${COMPARE_PAIR_SEPARATOR}${rightSlug.trim().toLowerCase()}`;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const REGISTRY_PATH = join(__dirname, "ai-tools-vertical.registry.json");
const REPORTS_DIR = join(__dirname, "reports");

const TRACKING_QUERY_PARAMETERS = new Set([
  "_hsenc",
  "_hsmi",
  "fbclid",
  "gbraid",
  "gclid",
  "igshid",
  "mc_cid",
  "mc_eid",
  "msclkid",
  "ref",
  "ref_src",
  "si",
  "spm",
  "utm_campaign",
  "utm_content",
  "utm_id",
  "utm_medium",
  "utm_source",
  "utm_term",
  "wbraid",
  "yclid"
]);

const prisma = createSeedPrismaClient();

function loadRegistry() {
  const raw = readFileSync(REGISTRY_PATH, "utf8");
  const parsed = JSON.parse(raw);

  if (!Array.isArray(parsed.entities) || !Array.isArray(parsed.curatedBattles)) {
    throw new Error("Invalid ai-tools-vertical registry: expected entities and curatedBattles arrays.");
  }

  return parsed;
}

function normalizeCanonicalUrl(input) {
  const url = parseHttpUrl(input);

  if (!url) {
    throw new Error(`Invalid website URL: ${input}`);
  }

  url.protocol = "https:";
  url.hostname = normalizeHostname(url.hostname);
  url.pathname = normalizePathname(url.pathname);
  url.hash = "";
  url.search = normalizeSearchParams(url.searchParams);

  return url.toString();
}

function parseHttpUrl(input) {
  try {
    const trimmedInput = input.trim();
    const inputHasProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmedInput);

    if (!inputHasProtocol && !hasLikelyHostname(trimmedInput)) {
      return null;
    }

    const url = new URL(inputHasProtocol ? trimmedInput : `https://${trimmedInput}`);

    if (!["http:", "https:"].includes(url.protocol)) {
      return null;
    }

    return url;
  } catch {
    return null;
  }
}

function hasLikelyHostname(input) {
  return input.includes(".") && !input.includes(" ");
}

function normalizeHostname(hostname) {
  return hostname.toLowerCase().replace(/^www\./, "");
}

function normalizePathname(pathname) {
  if (!pathname || pathname === "/") {
    return "/";
  }

  return pathname.replace(/\/+$/, "") || "/";
}

function normalizeSearchParams(searchParams) {
  const preserved = [...searchParams.entries()]
    .filter(([key]) => !TRACKING_QUERY_PARAMETERS.has(key.toLowerCase()))
    .sort(([leftKey, leftValue], [rightKey, rightValue]) => {
      const keyCompare = leftKey.localeCompare(rightKey);

      if (keyCompare !== 0) {
        return keyCompare;
      }

      return leftValue.localeCompare(rightValue);
    });

  if (preserved.length === 0) {
    return "";
  }

  return `?${new URLSearchParams(preserved).toString()}`;
}

async function upsertEntityLogo(entityId, logoUrl) {
  if (!logoUrl?.trim()) {
    return;
  }

  await prisma.entityMedia.upsert({
    create: {
      entityId,
      source: "MIGRATION",
      trustScore: 1,
      type: "LOGO",
      url: logoUrl.trim()
    },
    update: {
      trustScore: 1,
      url: logoUrl.trim()
    },
    where: {
      entityId_type_source: {
        entityId,
        source: "MIGRATION",
        type: "LOGO"
      }
    }
  });
}

async function seedEntity(entity, entityByKey) {
  const canonicalUrl = normalizeCanonicalUrl(entity.websiteUrl);
  const existingBySlug = await prisma.entity.findUnique({
    where: { slug: entity.slug }
  });

  if (existingBySlug?.canonicalUrl && existingBySlug.canonicalUrl !== canonicalUrl) {
    console.warn(
      `Warning: slug "${entity.slug}" already exists with canonical URL ${existingBySlug.canonicalUrl}; registry expects ${canonicalUrl}.`
    );
  }

  const existingByUrl = await prisma.entity.findUnique({
    where: { canonicalUrl }
  });

  if (existingByUrl && existingByUrl.slug !== entity.slug) {
    throw new Error(
      `Canonical URL conflict for ${entity.key}: ${canonicalUrl} belongs to slug "${existingByUrl.slug}".`
    );
  }

  const sharedData = {
    canonicalUrl,
    description: entity.description?.trim() ?? null,
    logoUrl: entity.logoUrl?.trim() ?? null,
    title: entity.title.trim(),
    type: entity.type,
    visibility: "ACTIVE"
  };

  let action;
  let record;

  if (existingBySlug) {
    const updateData = { ...sharedData };

    if (existingBySlug.createdBy) {
      delete updateData.createdBy;
    }

    record = await prisma.entity.update({
      data: updateData,
      where: { id: existingBySlug.id }
    });
    action = "updated";
  } else {
    record = await prisma.entity.create({
      data: {
        ...sharedData,
        createdBy: null,
        slug: entity.slug
      }
    });
    action = "created";
  }

  await upsertEntityLogo(record.id, entity.logoUrl);

  entityByKey.set(entity.key, {
    action,
    categories: entity.categories ?? [],
    entityId: record.id,
    key: entity.key,
    logoUrl: entity.logoUrl ?? null,
    slug: record.slug,
    title: record.title,
    websiteUrl: canonicalUrl
  });

  return { action, record };
}

function buildBattleReport(curatedBattles, entityByKey, siteUrl) {
  return curatedBattles
    .slice()
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((battle) => {
      const left = entityByKey.get(battle.leftKey);
      const right = entityByKey.get(battle.rightKey);

      if (!left || !right) {
        return {
          compareUrl: null,
          leftKey: battle.leftKey,
          leftSlug: left?.slug ?? null,
          leftTitle: left?.title ?? null,
          pairSlug: null,
          rightKey: battle.rightKey,
          rightSlug: right?.slug ?? null,
          rightTitle: right?.title ?? null,
          sortOrder: battle.sortOrder,
          status: "missing_entity"
        };
      }

      const pairSlug = buildCompareSlug(left.slug, right.slug);

      return {
        compareUrl: new URL(`/compare/${pairSlug}`, siteUrl).toString(),
        leftKey: battle.leftKey,
        leftSlug: left.slug,
        leftTitle: left.title,
        pairSlug,
        rightKey: battle.rightKey,
        rightSlug: right.slug,
        rightTitle: right.title,
        sortOrder: battle.sortOrder,
        status: "ok"
      };
    });
}

function buildMarkdownReport(report) {
  const lines = [
    "# AI Tools Vertical Seed Report",
    "",
    `- Finished at: ${report.finishedAt}`,
    `- Duration: ${report.durationMs} ms`,
    `- Environment: ${report.environment}`,
    `- Site URL: ${report.siteUrl}`,
    "",
    "## Summary",
    "",
    `- Entities created: ${report.summary.entitiesCreated}`,
    `- Entities updated: ${report.summary.entitiesUpdated}`,
    `- Battles resolved: ${report.summary.battlesOk}`,
    `- Battles missing entities: ${report.summary.battlesMissing}`,
    "",
    "## Entities",
    "",
    "| Key | Title | Slug | Action | Categories | Compare base |",
    "| --- | --- | --- | --- | --- | --- |",
    ...report.entities.map(
      (entity) =>
        `| ${entity.key} | ${entity.title} | ${entity.slug} | ${entity.action} | ${entity.categories.join(", ")} | ${entity.websiteUrl} |`
    ),
    "",
    "## Curated battles",
    "",
    "| Sort | Pair | Status | Compare URL |",
    "| --- | --- | --- | --- |",
    ...report.battles.map(
      (battle) =>
        `| ${battle.sortOrder} | ${battle.leftTitle ?? battle.leftKey} vs ${battle.rightTitle ?? battle.rightKey} | ${battle.status} | ${battle.compareUrl ?? "—"} |`
    ),
    ""
  ];

  return lines.join("\n");
}

async function main() {
  const startedAt = Date.now();
  const registry = loadRegistry();
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? registry.siteUrl ?? "https://opinia.ru").replace(/\/+$/, "");
  const entityByKey = new Map();
  const entityResults = [];

  let entitiesCreated = 0;
  let entitiesUpdated = 0;

  for (const entity of registry.entities) {
    const { action } = await seedEntity(entity, entityByKey);

    if (action === "created") {
      entitiesCreated += 1;
    } else {
      entitiesUpdated += 1;
    }

    entityResults.push(entityByKey.get(entity.key));
  }

  const battles = buildBattleReport(registry.curatedBattles, entityByKey, siteUrl);
  const battlesOk = battles.filter((battle) => battle.status === "ok").length;
  const battlesMissing = battles.length - battlesOk;
  const finishedAt = new Date().toISOString();

  const report = {
    battles,
    durationMs: Date.now() - startedAt,
    entities: entityResults,
    environment: process.env.NODE_ENV ?? "development",
    finishedAt,
    siteUrl,
    summary: {
      battlesMissing,
      battlesOk,
      entitiesCreated,
      entitiesUpdated,
      entitiesTotal: entityResults.length
    },
    vertical: registry.vertical
  };

  mkdirSync(REPORTS_DIR, { recursive: true });

  const jsonReportPath = join(REPORTS_DIR, "ai-tools-seed-latest.json");
  const mdReportPath = join(REPORTS_DIR, "ai-tools-seed-latest.md");

  writeFileSync(jsonReportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(mdReportPath, buildMarkdownReport(report), "utf8");

  console.log("AI Tools vertical seed complete.");
  console.log(`Entities: created=${entitiesCreated}, updated=${entitiesUpdated}, total=${entityResults.length}`);
  console.log(`Battles: ok=${battlesOk}, missing=${battlesMissing}`);
  console.log(`Report JSON: ${jsonReportPath}`);
  console.log(`Report MD: ${mdReportPath}`);

  if (battlesMissing > 0) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
