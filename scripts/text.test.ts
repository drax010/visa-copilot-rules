import assert from "node:assert/strict";
import { test } from "node:test";

import { findsQuote, htmlToText } from "./text.ts";

test("entities decode to the characters a browser shows", () => {
  assert.equal(htmlToText("<p>you&#8217;ll &rsquo; &amp; &pound;135 &#x2013; &nbsp;x</p>"), "you’ll ’ & £135 – x");
});

test("curly quotes in the page are kept as they are", () => {
  assert.equal(htmlToText("<p>you’ll leave the UK</p>"), "you’ll leave the UK");
});

test("scripts, styles and tags are dropped; block tags become line breaks", () => {
  const text = htmlToText("<style>p{}</style><script>var a = 1;</script><h2>Fees</h2><ul><li>One</li><li>Two</li></ul>");
  assert.equal(text, "## Fees\n- One\n- Two");
});

test("a quote is found across line breaks and repeated spaces", () => {
  const text = htmlToText("<p>You must have a passport\n   that is valid</p>");
  assert.equal(findsQuote(text, "You must have a passport that is valid", "html"), true);
});

test("a one-character change is not found", () => {
  const text = htmlToText("<p>A Standard Visitor visa costs £135 for up to 6 months.</p>");
  assert.equal(findsQuote(text, "A Standard Visitor visa costs £125 for up to 6 months.", "html"), false);
});

test("PDF text ignores all whitespace, because PDF extraction drops spaces at line wraps", () => {
  const text = "exempt from the sixmonth rule";
  assert.equal(findsQuote(text, "exempt from the six month rule", "pdf"), true);
  assert.equal(findsQuote(text, "exempt from the six month rule", "html"), false);
  assert.equal(findsQuote(text, "exempt from the five month rule", "pdf"), false);
});
