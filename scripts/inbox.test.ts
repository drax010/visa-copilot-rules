import assert from "node:assert/strict";
import { test } from "node:test";

import { readInboxFile } from "./inbox.ts";
import { htmlToText } from "./text.ts";

const visitor = "https://travel.state.gov/content/travel/en/us-visas/tourism-visit/visitor.html";
const embassy = "https://in.usembassy.gov/visas/";
const cited = [
  { url: visitor, title: "Visitor Visa, U.S. Department of State" },
  { url: embassy, title: "Visas, U.S. Embassy & Consulates in India" },
];

// The same converter as Firecrawl's pages, so a page's snapshot doesn't depend on how it arrived.
test("a saved page is matched by its canonical link, and converted like a fetched page", () => {
  const html = `<html><head><link rel="canonical" href="${embassy}"/><title>Visas - U.S. Embassy</title></head><body><p>A citizen</p></body></html>`;
  assert.deepEqual(readInboxFile("page.html", html, cited), { url: embassy, text: htmlToText(html) });
});

test("a page saved by Chrome is matched by its 'saved from url' note", () => {
  const html = `<!-- saved from url=(0084)${visitor} --><html><body><p>Visitor visas</p></body></html>`;
  assert.equal(readInboxFile("Visitor Visa.html", html, cited).url, visitor);
});

test("otherwise a saved page is matched by its title against the cited page titles", () => {
  const html = "<html><head><title>Visitor Visa</title></head><body><p>Visitor visas</p></body></html>";
  assert.equal(readInboxFile("Visitor Visa.html", html, cited).url, visitor);
});

test("copied text starts with the page's address, which is not part of the text", () => {
  assert.deepEqual(readInboxFile("visitor.txt", `${visitor}\r\nVisitor visas are nonimmigrant visas`, cited), { url: visitor, text: "Visitor visas are nonimmigrant visas" });
});

test("a file that can't be matched to a cited page is an error, never a guess", () => {
  assert.throws(() => readInboxFile("other.html", "<html><head><title>Something else</title></head></html>", cited), /other\.html/);
  assert.throws(() => readInboxFile("notes.txt", "Visitor visas are", cited), /first line/);
});
