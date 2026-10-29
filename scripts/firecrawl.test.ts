import assert from "node:assert/strict";
import { test } from "node:test";

import { scrape } from "./firecrawl.ts";

const key = "fc-test-key-not-real";
const page = "https://travel.state.gov/content/travel/en/us-visas/tourism-visit/visitor.html";
const pdf = "https://www.cbp.gov/sites/default/files/2025-12/Six-Month%20Passport%20Validity%20Update%2020251218.pdf";

type Call = { url: string; init: RequestInit };

// A fake fetch that answers each call with the next response in the list.
function fakeFetch(responses: { status?: number; body: unknown }[]) {
  const calls: Call[] = [];
  const fetch = async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const next = responses[Math.min(calls.length, responses.length) - 1];
    return new Response(JSON.stringify(next.body), { status: next.status ?? 200 });
  };
  return { calls, fetch: fetch as typeof globalThis.fetch };
}

const ok = (data: object) => ({ body: { success: true, data } });
const noWait = async () => {};
// Page-length text: anything under 200 characters counts as an almost empty page.
const visitorText = "Visitor visas are nonimmigrant visas for persons who want to enter the United States temporarily. ".repeat(3).trim();
const pdfText = "Citizens of the countries listed below are exempt from the sixmonth rule and need only have a passport valid for their intended period of stay. ".repeat(2).trim();

test("a web page is fetched fresh as raw HTML through the auto proxy, with the key as a bearer token", async () => {
  const { calls, fetch } = fakeFetch([ok({ rawHtml: `<p>${visitorText}</p>`, metadata: { statusCode: 200, title: "Visitor Visa" } })]);

  const text = await scrape(page, { key, fetch, sleep: noWait });

  assert.equal(text, visitorText);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.firecrawl.dev/v2/scrape");
  assert.equal((calls[0].init.headers as Record<string, string>).Authorization, `Bearer ${key}`);
  const body = JSON.parse(String(calls[0].init.body));
  assert.deepEqual({ url: body.url, formats: body.formats, proxy: body.proxy, maxAge: body.maxAge }, { url: page, formats: ["rawHtml"], proxy: "auto", maxAge: 0 });
});

test("a PDF is fetched as markdown and kept as text", async () => {
  const { calls, fetch } = fakeFetch([ok({ markdown: pdfText, metadata: { statusCode: 200 } })]);

  const text = await scrape(pdf, { key, fetch, sleep: noWait });

  assert.equal(text, pdfText);
  assert.deepEqual(JSON.parse(String(calls[0].init.body)).formats, ["markdown"]);
});

test("a block page is a failure, never a snapshot", async () => {
  for (const title of ["Attention Required! | Cloudflare", "Just a moment...", "Technical Difficulties"]) {
    const { fetch } = fakeFetch([ok({ rawHtml: "<p>Sorry</p>", metadata: { statusCode: 200, title } })]);
    await assert.rejects(scrape(page, { key, fetch, sleep: noWait }), /block page/, title);
  }
});

test("a page that answers with an error status is a failure", async () => {
  const { fetch } = fakeFetch([ok({ rawHtml: "<p>Forbidden</p>", metadata: { statusCode: 403, title: "403" } })]);
  await assert.rejects(scrape(page, { key, fetch, sleep: noWait }), /403/);
});

test("a busy or failing API is retried once", async () => {
  const { calls, fetch } = fakeFetch([{ status: 500, body: { success: false, error: "Internal" } }, ok({ rawHtml: `<p>${visitorText}</p>`, metadata: { statusCode: 200, title: "Visitor Visa" } })]);

  assert.equal(await scrape(page, { key, fetch, sleep: noWait }), visitorText);
  assert.equal(calls.length, 2);
});

// Seen on 2026-10-30: the visitor page once came back as HTML whose text was empty.
test("a page whose text is almost empty is retried once, then a failure", async () => {
  const empty = ok({ rawHtml: "<html><head><script>x()</script></head><body></body></html>", metadata: { statusCode: 200, title: "Visitor Visa" } });
  const full = ok({ rawHtml: `<p>${"Visitor visas are nonimmigrant visas. ".repeat(10)}</p>`, metadata: { statusCode: 200, title: "Visitor Visa" } });

  const retried = fakeFetch([empty, full]);
  assert.match(await scrape(page, { key, fetch: retried.fetch, sleep: noWait }), /^Visitor visas/);
  assert.equal(retried.calls.length, 2);

  const twice = fakeFetch([empty, empty]);
  await assert.rejects(scrape(page, { key, fetch: twice.fetch, sleep: noWait }), /almost empty/);
  assert.equal(twice.calls.length, 2);
});

test("an API error is reported with its status and message, and never with the key", async () => {
  const { calls, fetch } = fakeFetch([{ status: 402, body: { success: false, error: "Payment required" } }]);

  await assert.rejects(scrape(page, { key, fetch, sleep: noWait }), (error: Error) => {
    assert.match(error.message, /402/);
    assert.match(error.message, /Payment required/);
    assert.doesNotMatch(error.message, /fc-test-key/);
    return true;
  });
  assert.equal(calls.length, 1, "a 402 is not retried");
});
