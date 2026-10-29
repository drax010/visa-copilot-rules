// Turns a page's HTML into the text a reader sees, and finds quotes in it. This is the
// converter that proved all 52 seed quotes word for word; keep its behaviour unchanged.

export type Kind = "html" | "pdf";

export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, "")
    .replace(/<(h[1-6])[^>]*>/gi, "\n## ")
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<\/(p|div|h[1-6]|li|tr|ul|ol|table)>|<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&nbsp;/g, " ")
    .replace(/&rsquo;/g, "’")
    .replace(/&lsquo;/g, "‘")
    .replace(/&ldquo;/g, "“")
    .replace(/&rdquo;/g, "”")
    .replace(/&quot;/g, '"')
    .replace(/&pound;/g, "£")
    .replace(/&ndash;/g, "–")
    .replace(/&mdash;/g, "—")
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

// Web pages: whitespace is collapsed, nothing else changes. PDFs: whitespace is removed,
// because PDF text extraction drops the space at a line wrap ("sixmonth").
export function findsQuote(text: string, quote: string, kind: Kind): boolean {
  const squash = kind === "pdf" ? (s: string) => s.replace(/\s+/g, "") : (s: string) => s.replace(/\s+/g, " ");
  return squash(text).includes(squash(quote));
}
