// Saves the text of every page that v1/rules.json cites, so verify-quotes.ts can check each
// quote against it, and a git diff shows what changed on the page.
//
//   node scripts/snapshot.ts                       refresh every cited page
//   node scripts/snapshot.ts <url> [<url> ...]     refresh only these pages (cited or not)
//   node scripts/snapshot.ts --from <file> <url> [method]
//                                                  import a saved copy (.html, or .txt/.md text); method
//                                                  says where it came from, "manual" by default
//
// sources.json names each host's method: "govuk-api" (GOV.UK's content API) or "firecrawl"
// (the US government pages, which block plain downloads). Firecrawl needs a key, from
// FIRECRAWL_API_KEY or from a file named by FIRECRAWL_KEY_FILE; it is never printed.
// Pages saved by hand into inbox/ are imported first, and not fetched again (inbox.ts).
// A page that fails keeps its previous snapshot; the run then exits 1. A fetched copy under
// half the previous snapshot's size counts as a failure (guard.ts).
// Snapshots go in snapshots/<host>/<path>.txt, listed in snapshots/index.json.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { extname } from "node:path";

import { rulesFileSchema } from "../schema.ts";
import { scrape } from "./firecrawl.ts";
import { govukApiUrl, govukBodyHtml } from "./govuk.ts";
import { shrinkProblem } from "./guard.ts";
import { readInboxFile } from "./inbox.ts";
import { htmlToText, type Kind } from "./text.ts";
import { type IndexEntry, readIndex, snapshotsDir } from "./verify-quotes.ts";

const rulesFile = new URL("../v1/rules.json", import.meta.url);
const inboxDir = new URL("../inbox/", import.meta.url);
const methods: Record<string, string> = JSON.parse(readFileSync(new URL("../sources.json", import.meta.url), "utf8"));
const firecrawlGapMs = 7000; // Free plan: 10 scrapes a minute.

function kindOf(url: string): Kind {
  return new URL(url).pathname.toLowerCase().endsWith(".pdf") ? "pdf" : "html";
}

// https://www.gov.uk/standard-visitor/apply -> www.gov.uk/standard-visitor/apply.txt
function fileFor(url: string): string {
  const { hostname, pathname } = new URL(url);
  const path = decodeURIComponent(pathname)
    .replace(/^\/+|\/+$/g, "")
    .replace(/\.(html?|pdf)$/i, "")
    .replace(/[^A-Za-z0-9/_.-]+/g, "-");
  return `${hostname}/${path || "index"}.txt`;
}

function save(index: Record<string, IndexEntry>, url: string, text: string, method: string) {
  const file = fileFor(url);
  const target = new URL(file, snapshotsDir);
  mkdirSync(new URL(".", target), { recursive: true });
  const body = `${text.replace(/\r\n/g, "\n").trim()}\n`;
  writeFileSync(target, body);
  index[url] = {
    file,
    kind: kindOf(url),
    method,
    fetchedAt: new Date().toISOString(),
    sha256: createHash("sha256").update(body).digest("hex"),
  };
  console.log(`Saved ${file} (${method}, ${body.length} characters)`);
}

function writeIndex(index: Record<string, IndexEntry>) {
  const sorted = Object.fromEntries(Object.entries(index).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(new URL("index.json", snapshotsDir), `${JSON.stringify(sorted, null, 2)}\n`);
}

async function fetchGovuk(url: string): Promise<string> {
  const res = await fetch(govukApiUrl(url), { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`GOV.UK content API returned ${res.status} for ${url}`);
  return htmlToText(govukBodyHtml(await res.json(), url));
}

function firecrawlKey(): string {
  const fromEnv = process.env.FIRECRAWL_API_KEY?.trim();
  if (fromEnv) return fromEnv;
  const file = process.env.FIRECRAWL_KEY_FILE;
  return file && existsSync(file) ? readFileSync(file, "utf8").trim() : "";
}

const args = process.argv.slice(2);
mkdirSync(snapshotsDir, { recursive: true });
const index = readIndex();

if (args[0] === "--from") {
  const [, file, url, method = "manual"] = args;
  if (!file || !url) {
    console.log("Usage: node scripts/snapshot.ts --from <saved file> <url> [method]");
    process.exit(2);
  }
  const raw = readFileSync(file, "utf8");
  save(index, url, /^\.html?$/i.test(extname(file)) ? htmlToText(raw) : raw, method);
  writeIndex(index);
} else {
  const rules = rulesFileSchema.parse(JSON.parse(readFileSync(rulesFile, "utf8")));
  const pages = new Map(rules.corridors.flatMap((c) => c.requirements.map((r) => [r.source.url, r.source.title] as const)));
  const cited = [...pages].map(([url, title]) => ({ url, title }));
  let failed = 0;

  // Pages saved by hand come first, and aren't fetched again in this run.
  const imported = new Set<string>();
  const inbox = existsSync(inboxDir) ? readdirSync(inboxDir).filter((name) => name !== "README.md" && !name.startsWith(".")) : [];
  for (const name of inbox) {
    try {
      const { url, text } = readInboxFile(name, readFileSync(new URL(name, inboxDir), "utf8"), cited);
      save(index, url, text, "manual");
      imported.add(url);
      rmSync(new URL(name, inboxDir));
    } catch (error) {
      failed++;
      console.log(`::error::${(error as Error).message}`);
    }
  }

  const urls = (args.length ? args : [...pages.keys()].sort()).filter((url) => !imported.has(url));
  const key = firecrawlKey();
  let lastFirecrawl = 0;
  for (const url of urls) {
    const method = methods[new URL(url).hostname];
    try {
      let text: string;
      if (method === "govuk-api") {
        text = await fetchGovuk(url);
      } else if (method === "firecrawl") {
        if (!key) throw new Error(`no Firecrawl key for ${url}: set FIRECRAWL_API_KEY, or FIRECRAWL_KEY_FILE to a file holding it`);
        const wait = lastFirecrawl + firecrawlGapMs - Date.now();
        if (wait > 0) await new Promise((r) => setTimeout(r, wait));
        lastFirecrawl = Date.now();
        text = await scrape(url, { key });
      } else {
        throw new Error(`no method for ${new URL(url).hostname}; add it to sources.json`);
      }
      const previous = index[url] && existsSync(new URL(index[url].file, snapshotsDir)) ? readFileSync(new URL(index[url].file, snapshotsDir), "utf8").length : undefined;
      const problem = shrinkProblem(previous, text.trim().length + 1);
      if (problem) throw new Error(`${url}: ${problem}`);
      save(index, url, text, method);
    } catch (error) {
      failed++;
      console.log(`::error::${(error as Error).message} (the previous snapshot is kept)`);
    }
  }
  writeIndex(index);
  console.log(`\n${urls.length + imported.size - failed} page(s) saved, ${failed} failed.`);
  // exitCode, not process.exit(): on Windows, exiting while fetch's connections are still
  // open crashes Node (a libuv assertion, exit code 127).
  if (failed) process.exitCode = 1;
}
