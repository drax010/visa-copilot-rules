// GOV.UK's content API (https://www.gov.uk/api/content/<path>) returns a page's own HTML.
// A guide's part address (/standard-visitor/apply-standard-visitor-visa) redirects to the
// whole guide, so the part has to be picked out again.

type GovukPage = {
  base_path?: string;
  details?: { body?: string; parts?: { slug: string; body: string }[] };
};

export function govukApiUrl(url: string): string {
  return `https://www.gov.uk/api/content${new URL(url).pathname.replace(/\/$/, "")}`;
}

export function govukBodyHtml(page: GovukPage, url: string): string {
  const parts = page.details?.parts;
  if (!parts?.length) {
    if (typeof page.details?.body !== "string") throw new Error(`GOV.UK returned no body for ${url}`);
    return page.details.body;
  }
  const path = new URL(url).pathname.replace(/\/$/, "");
  if (path === page.base_path) return parts[0].body;
  const slug = path.slice((page.base_path ?? "").length + 1);
  const part = parts.find((p) => p.slug === slug);
  if (!part) throw new Error(`GOV.UK guide ${page.base_path} has no part "${slug}" (${url})`);
  return part.body;
}
