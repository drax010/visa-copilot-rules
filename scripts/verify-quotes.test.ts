import assert from "node:assert/strict";
import { test } from "node:test";

import type { RulesFile } from "../schema.ts";
import { type Snapshot, verifyQuotes } from "./verify-quotes.ts";

const url = "https://www.gov.uk/standard-visitor";

function rules(quote: string, sourceUrl = url): RulesFile {
  return {
    schemaVersion: 1,
    version: "2026.10.30-1",
    corridors: [
      {
        id: "uk-standard-visitor",
        destination: "UK",
        visaType: "Standard Visitor",
        nationalities: ["IN"],
        officialUrl: url,
        requirements: [
          {
            id: "uk-sv-fee",
            revision: 1,
            category: "fees",
            title: "Visa fee",
            detail: "GOV.UK lists the fee as £135.",
            mandatory: true,
            appliesTo: null,
            source: { title: "GOV.UK", url: sourceUrl },
            sourceQuote: quote,
            effectiveDate: null,
            lastVerified: "2026-10-30",
          },
        ],
      },
    ],
  };
}

const snapshots = new Map<string, Snapshot>([[url, { text: "A Standard Visitor visa costs £135 for up to 6 months.", kind: "html" }]]);

test("every quote found means no problems", () => {
  const result = verifyQuotes(rules("A Standard Visitor visa costs £135 for up to 6 months."), snapshots);
  assert.deepEqual(result, { found: 1, total: 1, problems: [] });
});

test("a changed quote is reported by corridor and item", () => {
  const result = verifyQuotes(rules("A Standard Visitor visa costs £125 for up to 6 months."), snapshots);
  assert.equal(result.found, 0);
  assert.deepEqual(result.problems, [{ corridor: "uk-standard-visitor", item: "uk-sv-fee", url, reason: "quote not found in the snapshot" }]);
});

test("a source with no snapshot is reported, never passed", () => {
  const other = "https://www.gov.uk/other-page";
  const result = verifyQuotes(rules("anything", other), snapshots);
  assert.deepEqual(result.problems, [{ corridor: "uk-standard-visitor", item: "uk-sv-fee", url: other, reason: "no snapshot of this page" }]);
});
