// The monthly review's bookkeeping, run by .github/workflows/monthly-review.yml after
// snapshot.ts has fetched every page again:
//
//   node scripts/review.ts bump --since <iso time> --base <main's rules.json>
//       sets lastVerified to today for every item whose quote was found on a page fetched
//       since that time, and if anything changed gives v1/rules.json the version one step
//       past main's
//   node scripts/review.ts report --since <iso time> --base <main's rules.json> --out <file>
//       [--checks "Tests=success,Quotes=failure"] [--credits <n>] [--run <url>]
//       writes the pull request body
//
// An item on a page that wasn't fetched again keeps its date, because its snapshot is the
// old one: nobody checked it against the live page. "Today" is the local date, so the
// workflow sets TZ to India time.

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";

import { type RulesFile, rulesFileSchema } from "../schema.ts";
import { type IndexEntry, loadSnapshots, type Problem, readIndex, verifyQuotes } from "./verify-quotes.ts";

// 2026.10.30-2 on 2026-11-01 -> 2026.11.01-1; a second review that day -> 2026.11.01-2.
export function nextVersion(current: string, today: string): string {
  const day = today.replaceAll("-", ".");
  const same = current.match(new RegExp(`^${day.replaceAll(".", "\\.")}-(\\d+)$`));
  return `${day}-${same ? Number(same[1]) + 1 : 1}`;
}

export function refreshedPages(index: Record<string, IndexEntry>, since: string): Set<string> {
  const start = Date.parse(since);
  return new Set(Object.entries(index).filter(([, entry]) => Date.parse(entry.fetchedAt) >= start).map(([url]) => url));
}

// Returns a copy; `verified` lists every item checked against a fresh page, `changed` whether
// any date moved (and so the version). The new version is one step past `baseVersion`, main's,
// so bumping again on a review branch doesn't move it a second time.
export function bumpVerified(rules: RulesFile, problems: Problem[], refreshed: Set<string>, today: string, baseVersion = rules.version) {
  const next = structuredClone(rules);
  const missing = new Set(problems.map((p) => `${p.corridor}/${p.item}`));
  const verified: string[] = [];
  let changed = false;
  for (const corridor of next.corridors) {
    for (const item of corridor.requirements) {
      if (missing.has(`${corridor.id}/${item.id}`) || !refreshed.has(item.source.url)) continue;
      verified.push(item.id);
      if (item.lastVerified !== today) {
        item.lastVerified = today;
        changed = true;
      }
    }
  }
  if (changed) next.version = nextVersion(baseVersion, today);
  return { rules: next, verified, changed };
}

export type Report = {
  month: string;
  today: string;
  versionBefore: string;
  versionAfter: string;
  verified: number;
  total: number;
  notRefreshed: string[];
  problems: Problem[];
  changedPages: string[];
  checks: { name: string; outcome: string }[];
  credits?: number;
  runUrl?: string;
};

const list = (lines: string[]) => (lines.length ? `\n${lines.map((line) => `  - ${line}`).join("\n")}` : " none");
const outcomes: Record<string, string> = { success: "Passed", failure: "**Failed**", skipped: "Skipped" };

export function reportBody(r: Report): string {
  const version = r.versionBefore === r.versionAfter ? `${r.versionAfter} (unchanged)` : `${r.versionBefore} → ${r.versionAfter}`;
  const failed = r.notRefreshed.length;
  const fetched = failed
    ? `${failed === 1 ? "1 page couldn't" : `${failed} pages couldn't`} be fetched (see below), so ${failed === 1 ? "its quotes were" : "their quotes were"} checked against the old snapshot. Every other cited page was fetched again`
    : "Every cited page was fetched again";
  return `## Monthly review ${r.month}

${fetched}, and every quote was checked word for word against its page's snapshot. Merging this pull request is the sign-off (\`decisions.md\` in the app repo, 2026-10-30).

- **Re-verified:** ${r.verified} of ${r.total} items; their \`lastVerified\` is now ${r.today}.
- **Version:** ${version}
- **Pages not fetched:**${list(r.notRefreshed)}${r.notRefreshed.length ? "\n  Their snapshots are the old ones, so their items keep their old dates. Save each page into `inbox/` and run `npm run snapshot` (see the README)." : ""}
- **Need a new quote:**${list(r.problems.map((p) => `${p.corridor} / ${p.item}: ${p.reason} (${p.url})`))}${r.problems.length ? "\n  Run `/redraft-rules` in Claude Code on this branch. This pull request stays a draft until every quote is found." : ""}
- **Pages whose text changed:**${list(r.changedPages.map((file) => `\`${file}\``))}${r.changedPages.length ? "\n  Read each one in Files changed: a change can alter what an item should say even when its quote is still there." : ""}

### Checks

| Check | Result |
| --- | --- |
${r.checks.map((c) => `| ${c.name} | ${outcomes[c.outcome] ?? c.outcome} |`).join("\n")}

GitHub doesn't run \`check.yml\` on a pull request opened by GitHub Actions, so these checks ran in the monthly workflow${r.runUrl ? ` ([run log](${r.runUrl}))` : ""}. Any later push to this branch runs \`check.yml\` as usual.
${r.credits === undefined ? "" : `\nFirecrawl credits left this billing period: ${r.credits}.\n`}`;
}

const rulesPath = new URL("../v1/rules.json", import.meta.url);
const today = () => new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD in the local time zone

function review(since: string, baseVersion: string) {
  // The raw JSON is what gets written back, so the file keeps its layout; the parse checks it.
  const raw: RulesFile = JSON.parse(readFileSync(rulesPath, "utf8"));
  const { problems, total } = verifyQuotes(rulesFileSchema.parse(raw), loadSnapshots());
  const refreshed = refreshedPages(readIndex(), since);
  const cited = [...new Set(raw.corridors.flatMap((c) => c.requirements.map((r) => r.source.url)))].sort();
  return { raw, problems, total, refreshed, cited, ...bumpVerified(raw, problems, refreshed, today(), baseVersion) };
}

if (import.meta.main) {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: { since: { type: "string" }, base: { type: "string" }, out: { type: "string" }, checks: { type: "string" }, credits: { type: "string" }, run: { type: "string" } },
  });
  const [command] = positionals;
  if (!values.since || !values.base || (command !== "bump" && command !== "report") || (command === "report" && !values.out)) {
    console.log("Usage: node scripts/review.ts bump --since <iso time> --base <main's rules.json>");
    console.log("       node scripts/review.ts report --since <iso time> --base <rules.json> --out <file> [--checks Name=outcome,...] [--credits <n>] [--run <url>]");
    process.exit(2);
  }
  const base: RulesFile = JSON.parse(readFileSync(values.base, "utf8"));
  const r = review(values.since, base.version);

  if (command === "bump") {
    if (r.changed) writeFileSync(rulesPath, `${JSON.stringify(r.rules, null, 2)}\n`);
    console.log(`${r.verified.length} of ${r.total} items re-verified; version ${r.raw.version}${r.changed ? ` -> ${r.rules.version}` : " (unchanged)"}.`);
  } else {
    const status = execFileSync("git", ["status", "--porcelain", "--untracked-files=all", "--", "snapshots/"], { encoding: "utf8" });
    const changedPages = status
      .split("\n")
      .map((line) => line.slice(3).trim())
      .filter((file) => file && !file.endsWith("index.json"));
    const checks = (values.checks ?? "")
      .split(",")
      .filter(Boolean)
      .map((pair) => {
        const [name, outcome] = pair.split("=");
        return { name, outcome };
      });
    const body = reportBody({
      month: today().slice(0, 7),
      today: today(),
      versionBefore: base.version,
      versionAfter: r.raw.version,
      verified: r.verified.length,
      total: r.total,
      notRefreshed: r.cited.filter((url) => !r.refreshed.has(url)),
      problems: r.problems,
      changedPages,
      checks,
      credits: values.credits && /^\d+$/.test(values.credits) ? Number(values.credits) : undefined,
      runUrl: values.run,
    });
    writeFileSync(values.out!, body);
    console.log(body);
  }
}
