import assert from "node:assert/strict";
import { test } from "node:test";

import type { RulesFile } from "../schema.ts";
import { bumpVerified, nextVersion, refreshedPages, type Report, reportBody } from "./review.ts";
import type { IndexEntry, Problem } from "./verify-quotes.ts";

const fees = "https://www.gov.uk/standard-visitor";
const visitor = "https://travel.state.gov/content/travel/en/us-visas/tourism-visit/visitor.html";

function item(id: string, url: string) {
  return {
    id,
    revision: 1,
    category: "fees" as const,
    title: "Visa fee",
    detail: "The page lists the fee.",
    mandatory: true,
    appliesTo: null,
    source: { title: "Official page", url },
    sourceQuote: "The fee is £135.",
    effectiveDate: null,
    lastVerified: "2026-10-29",
  };
}

// Two items on a GOV.UK page and one on a US page.
function rules(): RulesFile {
  return {
    schemaVersion: 1,
    version: "2026.10.30-2",
    corridors: [
      {
        id: "uk-standard-visitor",
        destination: "UK",
        visaType: "Standard Visitor",
        nationalities: ["IN"],
        officialUrl: fees,
        requirements: [item("uk-sv-fee", fees), item("uk-sv-length", fees)],
      },
      {
        id: "us-b1b2",
        destination: "US",
        visaType: "B-1/B-2 visitor",
        nationalities: ["IN"],
        officialUrl: visitor,
        requirements: [item("us-b1b2-fee", visitor)],
      },
    ],
  };
}

const dates = (file: RulesFile) => file.corridors.flatMap((c) => c.requirements.map((r) => `${r.id} ${r.lastVerified}`));

test("the version takes the review's date, numbered from 1 each day", () => {
  assert.equal(nextVersion("2026.10.30-2", "2026-11-01"), "2026.11.01-1");
  assert.equal(nextVersion("2026.11.01-1", "2026-11-01"), "2026.11.01-2");
  assert.equal(nextVersion("2026.11.01-9", "2026-11-01"), "2026.11.01-10");
});

test("a page counts as re-fetched only if its snapshot is newer than the run's start", () => {
  const entry = (fetchedAt: string): IndexEntry => ({ file: "x.txt", kind: "html", method: "firecrawl", fetchedAt, sha256: "0" });
  const index = { [fees]: entry("2026-11-01T06:01:00.000Z"), [visitor]: entry("2026-10-29T22:42:19.468Z") };

  assert.deepEqual([...refreshedPages(index, "2026-11-01T06:00:00.000Z")], [fees]);
});

test("an item found on a re-fetched page gets today's date, and the file a new version", () => {
  const before = rules();
  const { rules: after, verified, changed } = bumpVerified(before, [], new Set([fees, visitor]), "2026-11-01");

  assert.deepEqual(dates(after), ["uk-sv-fee 2026-11-01", "uk-sv-length 2026-11-01", "us-b1b2-fee 2026-11-01"]);
  assert.deepEqual(verified, ["uk-sv-fee", "uk-sv-length", "us-b1b2-fee"]);
  assert.equal(changed, true);
  assert.equal(after.version, "2026.11.01-1");
  assert.equal(before.version, "2026.10.30-2", "the input is left alone");
  assert.equal(before.corridors[0].requirements[0].lastVerified, "2026-10-29", "the input is left alone");
});

test("an item on a page that wasn't re-fetched keeps its date: nobody checked it against the live page", () => {
  const { rules: after, verified } = bumpVerified(rules(), [], new Set([fees]), "2026-11-01");

  assert.deepEqual(dates(after), ["uk-sv-fee 2026-11-01", "uk-sv-length 2026-11-01", "us-b1b2-fee 2026-10-29"]);
  assert.deepEqual(verified, ["uk-sv-fee", "uk-sv-length"]);
});

test("an item whose quote is missing keeps its date", () => {
  const missing: Problem = { corridor: "uk-standard-visitor", item: "uk-sv-fee", url: fees, reason: "quote not found in the snapshot" };
  const { rules: after, verified } = bumpVerified(rules(), [missing], new Set([fees, visitor]), "2026-11-01");

  assert.deepEqual(dates(after), ["uk-sv-fee 2026-10-29", "uk-sv-length 2026-11-01", "us-b1b2-fee 2026-11-01"]);
  assert.deepEqual(verified, ["uk-sv-length", "us-b1b2-fee"]);
});

test("nothing re-verified, or already verified today, leaves the file and its version alone", () => {
  const none = bumpVerified(rules(), [], new Set(), "2026-11-01");
  assert.equal(none.changed, false);
  assert.equal(none.rules.version, "2026.10.30-2");

  const again = bumpVerified(bumpVerified(rules(), [], new Set([fees, visitor]), "2026-11-01").rules, [], new Set([fees, visitor]), "2026-11-01");
  assert.equal(again.changed, false);
  assert.equal(again.rules.version, "2026.11.01-1");
  assert.equal(again.verified.length, 3);
});

// Seen on 2026-10-30: bump run a second time on the review branch moved -3 to -4.
test("bumping again on a review branch keeps the version one step past main's", () => {
  const first = bumpVerified(rules(), [], new Set([fees]), "2026-11-01", "2026.10.30-2");
  assert.equal(first.rules.version, "2026.11.01-1");

  const second = bumpVerified(first.rules, [], new Set([visitor]), "2026-11-01", "2026.10.30-2");
  assert.equal(second.changed, true);
  assert.equal(second.rules.version, "2026.11.01-1");
});

const report: Report = {
  month: "2026-11",
  today: "2026-11-01",
  versionBefore: "2026.10.30-2",
  versionAfter: "2026.11.01-1",
  verified: 2,
  total: 3,
  notRefreshed: [],
  problems: [],
  changedPages: [],
  checks: [
    { name: "Tests", outcome: "success" },
    { name: "Schema and version", outcome: "success" },
  ],
  credits: 994,
  runUrl: "https://github.com/drax010/visa-copilot-rules/actions/runs/1",
};

test("the report gives the counts, the version, the checks, the credits left and the run", () => {
  const body = reportBody(report);

  assert.match(body, /Every cited page was fetched again/);
  assert.match(body, /2 of 3 items/);
  assert.match(body, /2026\.10\.30-2 → 2026\.11\.01-1/);
  assert.match(body, /Tests \| Passed/);
  assert.match(body, /994/);
  assert.match(body, /actions\/runs\/1/);
  assert.match(body, /Pages not fetched:\*\* none/);
  assert.match(body, /Need a new quote:\*\* none/);
});

test("the report names each page that wasn't fetched, each missing quote, each changed page and each failed check", () => {
  const body = reportBody({
    ...report,
    notRefreshed: [visitor],
    problems: [{ corridor: "uk-standard-visitor", item: "uk-sv-fee", url: fees, reason: "quote not found in the snapshot" }],
    changedPages: ["snapshots/www.gov.uk/standard-visitor.txt"],
    checks: [{ name: "Quotes", outcome: "failure" }],
  });

  assert.doesNotMatch(body, /Every cited page was fetched again/);
  assert.match(body, /1 page couldn't be fetched/);
  assert.match(body, new RegExp(`- ${visitor.replaceAll(".", "\\.")}`));
  assert.match(body, /uk-standard-visitor \/ uk-sv-fee: quote not found in the snapshot/);
  assert.match(body, /\/redraft-rules/);
  assert.match(body, /snapshots\/www\.gov\.uk\/standard-visitor\.txt/);
  assert.match(body, /Quotes \| \*\*Failed\*\*/);
});
