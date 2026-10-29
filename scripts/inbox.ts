// Reads a page that someone saved by hand into inbox/, for when Firecrawl can't fetch it.
// A saved page (.html) is matched to its address by its canonical link, Chrome's "saved from
// url" note, or its title against the cited pages' titles. Copied text (.txt) must start
// with the page's address on its own line. Anything else is an error, never a guess.

import { htmlToText } from "./text.ts";

type Cited = { url: string; title: string };

const tidy = (url: string) => url.replace(/\/+$/, "").toLowerCase();

function cited(url: string, pages: Cited[]): string {
  return pages.find((p) => tidy(p.url) === tidy(url))?.url ?? url;
}

function byTitle(html: string, pages: Cited[]): string | undefined {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
  if (!title) return undefined;
  // "Visas - U.S. Embassy & Consulates in India - …" is cited as "Visas, U.S. Embassy & Consulates in India".
  const name = htmlToText(title).split(/ [-|] /)[0].trim();
  const matches = pages.filter((p) => p.title.split(", ")[0].trim() === name);
  return matches.length === 1 ? matches[0].url : undefined;
}

export function readInboxFile(name: string, content: string, pages: Cited[]): { url: string; text: string } {
  if (/\.txt$/i.test(name)) {
    const [first = "", ...rest] = content.replace(/\r\n/g, "\n").split("\n");
    if (!/^https:\/\/\S+$/.test(first.trim())) throw new Error(`${name}: the first line must be the page's https address`);
    return { url: cited(first.trim(), pages), text: rest.join("\n").trim() };
  }
  const canonical =
    /<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)["']/i.exec(content)?.[1] ??
    /<link[^>]+href=["']([^"']+)["'][^>]*rel=["']canonical["']/i.exec(content)?.[1];
  const savedFrom = /saved from url=\(\d+\)(https:\/\/[^\s>]+?)\s*-->/i.exec(content)?.[1];
  const url = (canonical && cited(canonical, pages)) ?? (savedFrom && cited(savedFrom, pages)) ?? byTitle(content, pages);
  if (!url) throw new Error(`${name}: can't tell which page this is. Use node scripts/snapshot.ts --from <file> <url>`);
  return { url, text: htmlToText(content) };
}
