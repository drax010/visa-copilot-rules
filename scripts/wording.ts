// The app gives information, not advice, and never promises an outcome (the app repo's
// docs/constraints.md). Titles and details are our words, so they're checked; sourceQuote is
// the official page's words and isn't. "no guarantee" is allowed; "guaranteed" isn't.

const banned: [label: string, pattern: RegExp][] = [
  ["guaranteed", /\bguaranteed\b/i],
  ["legal advice", /\blegal advice\b/i],
  ["official visa service", /\bofficial visa service\b/i],
  ["you should", /\byou should\b/i],
  ["you are eligible", /\byou are eligible\b/i],
  ["you're eligible", /\byou['’]re eligible\b/i],
];

type Items = { corridors: { id: string; requirements: { id: string; title: string; detail: string }[] }[] };

export function wordingProblems(rules: Items): string[] {
  const problems: string[] = [];
  for (const corridor of rules.corridors) {
    for (const item of corridor.requirements) {
      for (const field of ["title", "detail"] as const) {
        for (const [label, pattern] of banned) {
          if (pattern.test(item[field])) problems.push(`${corridor.id} / ${item.id}: ${field} says "${label}"`);
        }
      }
    }
  }
  return problems;
}
