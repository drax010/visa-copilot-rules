// Usage: node scripts/verify-quotes.ts <rules.json>
// Fails unless every item's sourceQuote is found in the committed snapshot of its source.url
// (snapshots/index.json). A made-up or paraphrased quote can't pass. Lines starting with ::
// are GitHub Actions annotations; locally they read as plain text.

import { readFileSync } from "node:fs";

import { type RulesFile, rulesFileSchema } from "../schema.ts";
import { findsQuote, type Kind } from "./text.ts";

export type Snapshot = { text: string; kind: Kind };
export type Problem = { corridor: string; item: string; url: string; reason: string };

export function verifyQuotes(rules: RulesFile, snapshots: Map<string, Snapshot>) {
  const problems: Problem[] = [];
  let found = 0;
  let total = 0;
  for (const corridor of rules.corridors) {
    for (const item of corridor.requirements) {
      total++;
      const url = item.source.url;
      const snapshot = snapshots.get(url);
      if (!snapshot) {
        problems.push({ corridor: corridor.id, item: item.id, url, reason: "no snapshot of this page" });
      } else if (!findsQuote(snapshot.text, item.sourceQuote, snapshot.kind)) {
        problems.push({ corridor: corridor.id, item: item.id, url, reason: "quote not found in the snapshot" });
      } else {
        found++;
      }
    }
  }
  return { found, total, problems };
}

export type IndexEntry = { file: string; kind: Kind; method: string; fetchedAt: string; sha256: string };

export const snapshotsDir = new URL("../snapshots/", import.meta.url);

export function readIndex(): Record<string, IndexEntry> {
  try {
    return JSON.parse(readFileSync(new URL("index.json", snapshotsDir), "utf8"));
  } catch {
    return {};
  }
}

export function loadSnapshots(): Map<string, Snapshot> {
  const snapshots = new Map<string, Snapshot>();
  for (const [url, entry] of Object.entries(readIndex())) {
    snapshots.set(url, { text: readFileSync(new URL(entry.file, snapshotsDir), "utf8"), kind: entry.kind });
  }
  return snapshots;
}

if (import.meta.main) {
  const file = process.argv[2];
  if (!file) {
    console.log("Usage: node scripts/verify-quotes.ts <rules.json>");
    process.exit(2);
  }
  const rules = rulesFileSchema.parse(JSON.parse(readFileSync(file, "utf8")));
  const { found, total, problems } = verifyQuotes(rules, loadSnapshots());
  for (const p of problems) {
    console.log(`::error file=${file}::${p.corridor} / ${p.item}: ${p.reason} (${p.url})`);
  }
  console.log(`${found} of ${total} quotes found word for word in their snapshots.`);
  if (problems.length) process.exit(1);
}
