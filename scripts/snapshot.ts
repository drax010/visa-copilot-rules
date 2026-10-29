// Saves the text of every page that v1/rules.json cites, so verify-quotes.ts can check each
// quote against it, and a git diff shows what changed on the page.
//
//   node scripts/snapshot.ts                     refresh every page whose host has an automatic method
//   node scripts/snapshot.ts --from <file> <url> [method]
//                                                import a saved copy (.html, or .txt/.md text); method
//                                                says where it came from, "manual" by default
//
// sources.json names each host's method: "govuk-api" (GOV.UK's content API) or "firecrawl"
// (blocked US pages; Step 2). Snapshots go in snapshots/<host>/<path>.txt, listed in
// snapshots/index.json with how and when each was fetched.

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname } from "node:path";

import { rulesFileSchema } from "../schema.ts";
import { govukApiUrl, govukBodyHtml } from "./govuk.ts";
import { htmlToText, type Kind } from "./text.ts";
import { type IndexEntry, readIndex, snapshotsDir } from "./verify-quotes.ts";

const rulesFile = new URL("../v1/rules.json", import.meta.url);
const methods: Record<string, string> = JSON.parse(readFileSync(new URL("../sources.json", import.meta.url), "utf8"));

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
  const urls = [...new Set(rules.corridors.flatMap((c) => c.requirements.map((r) => r.source.url)))].sort();
  let failed = 0;
  for (const url of urls) {
    const method = methods[new URL(url).hostname];
    try {
      if (method === "govuk-api") save(index, url, await fetchGovuk(url), method);
      else if (method) console.log(`Skipped ${url}: method "${method}" isn't available yet; import a saved copy with --from`);
      else throw new Error(`no method for ${new URL(url).hostname}; add it to sources.json`);
    } catch (error) {
      failed++;
      console.log(`::error::${(error as Error).message}`);
    }
  }
  writeIndex(index);
  if (failed) process.exit(1);
}
