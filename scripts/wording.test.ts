import assert from "node:assert/strict";
import { test } from "node:test";

import { wordingProblems } from "./wording.ts";

function item(title: string, detail: string, sourceQuote = "A quote.") {
  return { corridors: [{ id: "us-b1b2", requirements: [{ id: "us-b1b2-x", title, detail, sourceQuote }] }] };
}

test("descriptive wording passes, including 'no guarantee'", () => {
  assert.deepEqual(wordingProblems(item("Visa fee", "The State Department says there is no guarantee of a visa.")), []);
});

test("advice and promises in a title or detail are flagged, whatever the case", () => {
  assert.deepEqual(wordingProblems(item("You Should apply early", "Approval is guaranteed.")), [
    "us-b1b2 / us-b1b2-x: title says \"you should\"",
    "us-b1b2 / us-b1b2-x: detail says \"guaranteed\"",
  ]);
});

test("each banned phrase is caught", () => {
  for (const phrase of ["legal advice", "official visa service", "you are eligible", "you're eligible", "you’re eligible"]) {
    assert.equal(wordingProblems(item("Title", `This is ${phrase}.`)).length, 1, phrase);
  }
});

test("the official page's own words in sourceQuote are not checked", () => {
  assert.deepEqual(wordingProblems(item("Title", "Detail.", "You should check if you need a visa.")), []);
});
