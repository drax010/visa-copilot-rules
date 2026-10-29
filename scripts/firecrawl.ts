// Fetches one page through Firecrawl (https://docs.firecrawl.dev/api-reference/endpoint/scrape).
// The US government pages block plain downloads; Firecrawl's "auto" proxy retries through its
// enhanced proxies when a site answers 401, 403 or 429. But travel.state.gov often answers with
// a blank page and status 200 (about 7 of 12 fetches on 2026-10-30, at random), which "auto"
// doesn't retry. Fetching again recovers it, so an almost empty answer gets up to 3 more tries.
// They ask for "enhanced", which costs the same; Firecrawl still reported "basic" for the one
// that worked, so it isn't known whether that helps. maxAge 0 skips Firecrawl's 2-day cache.
// Web pages come back as raw HTML (Firecrawl's markdown splits sentences, which breaks quote
// matching); PDFs as markdown, which is their extracted text. 1 credit per page.

import { htmlToText } from "./text.ts";

const endpoint = "https://api.firecrawl.dev/v2/scrape";
// Titles of pages that stand in for the real one: Cloudflare, the embassy's 403, the CMS status page.
const blockPage = /Attention Required|Just a moment|Technical Difficulties|Access denied|Content modified/i;
// The smallest cited page, the CBP bulletin, is about 1,900 characters of text.
const minText = 200;
// Tries for a page that keeps coming back almost empty: at 7 in 12, 4 tries fail about 1 time in 9.
const emptyTries = 4;

type Options = { key: string; fetch?: typeof fetch; sleep?: (ms: number) => Promise<void> };

export async function scrape(url: string, { key, fetch = globalThis.fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }: Options): Promise<string> {
  const pdf = new URL(url).pathname.toLowerCase().endsWith(".pdf");
  const request = (proxy: string) =>
    fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url, formats: [pdf ? "markdown" : "rawHtml"], proxy, maxAge: 0, timeout: 120000 }),
      signal: AbortSignal.timeout(150000),
    });
  const fail = (message: string) => new Error(message.replaceAll(key, "[key]"));

  // A busy API (429, 5xx) gets one more try through the same proxy, an almost empty page up to
  // emptyTries in all; anything else fails at once.
  let proxy = "auto";
  let busyRetried = false;
  for (let tries = 1; ; ) {
    const res = await request(proxy);
    if ((res.status === 429 || res.status >= 500) && !busyRetried) {
      busyRetried = true;
      await sleep(10000);
      continue;
    }
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.success) throw fail(`Firecrawl returned ${res.status} for ${url}: ${body.error ?? "no error message"}`);

    const meta = body.data?.metadata ?? {};
    const title = String((Array.isArray(meta.title) ? meta.title[0] : meta.title) ?? "");
    if (meta.statusCode >= 400) throw fail(`${url} answered ${meta.statusCode} ("${title}")`);
    if (blockPage.test(title)) throw fail(`${url} came back as a block page ("${title}")`);

    const content: unknown = pdf ? body.data?.markdown : body.data?.rawHtml;
    const text = typeof content !== "string" ? "" : pdf ? content.trim() : htmlToText(content);
    if (text.length >= minText) return text;
    if (tries < emptyTries) {
      tries++;
      proxy = "enhanced";
      await sleep(10000);
      continue;
    }
    const size = typeof content === "string" ? content.length : 0;
    throw fail(`${url} came back almost empty ${emptyTries} times (${text.length} characters of text; last answer: status ${meta.statusCode}, ${size} bytes of ${pdf ? "markdown" : "HTML"}, proxy ${meta.proxyUsed ?? "unknown"})`);
  }
}
