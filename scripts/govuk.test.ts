import assert from "node:assert/strict";
import { test } from "node:test";

import { govukApiUrl, govukBodyHtml } from "./govuk.ts";

// The shape GOV.UK's content API returns for a guide with parts, and for a single page.
const guide = {
  base_path: "/standard-visitor",
  details: {
    parts: [
      { slug: "overview", body: "<p>Overview text</p>" },
      { slug: "apply-standard-visitor-visa", body: "<p>Apply text</p>" },
    ],
  },
};

test("the API address is the page path under /api/content", () => {
  assert.equal(govukApiUrl("https://www.gov.uk/standard-visitor/apply-standard-visitor-visa"), "https://www.gov.uk/api/content/standard-visitor/apply-standard-visitor-visa");
});

test("a guide's own address shows its first part", () => {
  assert.equal(govukBodyHtml(guide, "https://www.gov.uk/standard-visitor"), "<p>Overview text</p>");
});

test("a guide part's address shows that part", () => {
  assert.equal(govukBodyHtml(guide, "https://www.gov.uk/standard-visitor/apply-standard-visitor-visa"), "<p>Apply text</p>");
});

test("an unknown part is an error, not another part's text", () => {
  assert.throws(() => govukBodyHtml(guide, "https://www.gov.uk/standard-visitor/no-such-part"), /no-such-part/);
});

test("a page without parts shows its body", () => {
  assert.equal(govukBodyHtml({ base_path: "/x", details: { body: "<p>Body</p>" } }, "https://www.gov.uk/x"), "<p>Body</p>");
});
