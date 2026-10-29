// Usage: node scripts/check.ts <rules.json> [<base rules.json>]
// Fails when the file breaks the schema. Given the base branch's copy, it also fails when
// `version` is unchanged, and warns when an item's `detail` changed but its `revision` didn't.
// Lines starting with :: are GitHub Actions annotations; locally they read as plain text.

import { readFileSync } from "node:fs";

import { type RulesFile, rulesFileSchema } from "../schema.ts";

const [file, baseFile] = process.argv.slice(2);
if (!file) {
  console.log("Usage: node scripts/check.ts <rules.json> [<base rules.json>]");
  process.exit(2);
}

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    console.log(`::error file=${path}::Not readable JSON: ${(error as Error).message}`);
    process.exit(1);
  }
}

// Names an issue by corridor and item id, not only by array position.
function describe(data: unknown, path: PropertyKey[]): string {
  const where = path.join(".");
  const file = data as { corridors?: { id?: unknown; requirements?: { id?: unknown }[] }[] };
  const corridor = typeof path[1] === "number" ? file.corridors?.[path[1]] : undefined;
  const item = typeof path[3] === "number" ? corridor?.requirements?.[path[3]] : undefined;
  const ids = [corridor?.id, item?.id].filter((id) => typeof id === "string");
  return ids.length ? `${where} (${ids.join(" / ")})` : where || "(file)";
}

const data = readJson(file);
const result = rulesFileSchema.safeParse(data);
if (!result.success) {
  for (const issue of result.error.issues) {
    console.log(`::error file=${file}::${describe(data, issue.path)}: ${issue.message}`);
  }
  console.log(`\n${file} fails the schema (${result.error.issues.length} problem(s)).`);
  process.exit(1);
}
const rules = result.data;
console.log(`${file} passes the schema: version ${rules.version}, ${rules.corridors.length} corridor(s).`);

if (baseFile) {
  const base = rulesFileSchema.safeParse(readJson(baseFile));
  if (!base.success) {
    console.log(`::warning::The base copy fails the schema, so it can't be compared.`);
  } else {
    compare(base.data, rules);
  }
}

function compare(base: RulesFile, next: RulesFile) {
  let failed = false;
  if (next.version === base.version) {
    console.log(`::error file=${file}::version is still ${base.version}. Change it so the app downloads this file.`);
    failed = true;
  }
  let warnings = 0;
  for (const corridor of next.corridors) {
    const before = base.corridors.find((c) => c.id === corridor.id);
    for (const item of corridor.requirements) {
      const old = before?.requirements.find((r) => r.id === item.id);
      if (old && old.detail !== item.detail && old.revision === item.revision) {
        console.log(
          `::warning file=${file}::${corridor.id} / ${item.id}: detail changed but revision is still ${item.revision}. Bump revision if the item's meaning changed.`,
        );
        warnings++;
      }
    }
  }
  console.log(`Compared with the base copy (version ${base.version}): ${warnings} warning(s).`);
  if (failed) process.exit(1);
}
