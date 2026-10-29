// Fetches one page through Firecrawl (https://docs.firecrawl.dev/api-reference/endpoint/scrape).
// The US government pages block plain downloads; Firecrawl's "auto" proxy retries through its
// enhanced proxies when a site answers 401, 403 or 429. maxAge 0 skips Firecrawl's 2-day cache.
// Web pages come back as raw HTML (Firecrawl's markdown splits sentences, which breaks quote
// matching); PDFs as markdown, which is their extracted text. 1 credit per page.

import { htmlToText } from "./text.ts";

const endpoint = "https://api.firecrawl.dev/v2/scrape";
// Titles of pages that stand in for the real one: Cloudflare, the embassy's 403, the CMS status page.
const blockPage = /Attention Required|Just a moment|Technical Difficulties|Access denied|Content modified/i;
// The smallest cited page, the CBP bulletin, is about 1,900 characters of text.
const minText = 200;

type Options = { key: string; fetch?: typeof fetch; sleep?: (ms: number) => Promise<void> };

export async function scrape(url: string, { key, fetch = globalThis.fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }: Options): Promise<string> {
  const pdf = new URL(url).pathname.toLowerCase().endsWith(".pdf");
  const request = () =>
    fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url, formats: [pdf ? "markdown" : "rawHtml"], proxy: "auto", maxAge: 0, timeout: 120000 }),
      signal: AbortSignal.timeout(150000),
    });
  const fail = (message: string) => new Error(message.replaceAll(key, "[key]"));

  // A busy API (429, 5xx) or an almost empty page gets one more try; anything else fails at once.
  for (let attempt = 1; ; attempt++) {
    const res = await request();
    if ((res.status === 429 || res.status >= 500) && attempt === 1) {
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
    if (attempt === 1) {
      await sleep(10000);
      continue;
    }
    throw fail(`${url} came back almost empty twice (${text.length} characters of text)`);
  }
}
