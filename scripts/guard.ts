// A fetched copy that is under half the size of the page's previous snapshot is more likely a
// broken answer than a real change (on 2026-10-30 the visitor page once came back with no
// text at all). It's refused and the old snapshot kept. If the page really did shrink, a
// person imports it by hand (inbox/ or --from), which this check doesn't apply to.

export function shrinkProblem(previous: number | undefined, next: number): string | undefined {
  if (previous === undefined || next * 2 >= previous) return undefined;
  return `the new copy has ${next} characters, under half the previous snapshot's ${previous}. If the page really shrank, import it by hand (inbox/ or --from)`;
}
