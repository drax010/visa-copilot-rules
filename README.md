# visa-copilot-rules

The visa document checklists that the Visa Copilot Android app downloads. The app is information only, not legal or immigration advice: every item restates an official page, cites it, and quotes it word for word. Always check the official page before you apply.

The app reads one file, served by GitHub Pages:

```
https://drax010.github.io/visa-copilot-rules/v1/rules.json
```

v1 covers two corridors, for Indian passports only: US B-1/B-2 visitor visa and UK Standard Visitor visa.

## What's here

- `v1/rules.json`: the checklists.
- `schema.ts`: the rules every file must pass. It is a copy of the app's `src/data/schema.ts`; when the app's schema changes, copy it here in the same week.
- `scripts/check.ts`: the checker. CI runs it on every pull request and every push to `main`. It also fails a title or detail that gives advice or promises an outcome ("you should", "guaranteed"; see `scripts/wording.ts`).
- `snapshots/`: the text of every page the rules cite, one `.txt` file per page, listed in `snapshots/index.json` with how and when each was fetched.
- `scripts/verify-quotes.ts`: fails unless every `sourceQuote` is found word for word in the snapshot of its `source.url`. CI runs it on every pull request, so a quote that isn't on the page can't merge.
- `scripts/snapshot.ts` and `sources.json`: fetch the snapshots. GOV.UK pages come from GOV.UK's content API; the US government pages block plain downloads, so they come through Firecrawl (`sources.json` names each host's method).

## Snapshots and the quote check

- `npm run snapshot` refreshes every page whose host has an automatic method. Firecrawl isn't wired in yet; until it is, import a saved copy: `node scripts/snapshot.ts --from <saved .html or .txt> <url> [method]`.
- `npm run verify` checks every quote against the snapshots. Whitespace is collapsed and nothing else changes; for PDFs, whitespace is ignored, because PDF text loses spaces at line wraps.
- `npm test` runs the scripts' tests.
- After refreshing, `git diff snapshots/` shows what changed on each page.

## Changing the rules

1. Branch from `main`. Never edit `main` directly; the app picks up whatever is there.
2. Edit `v1/rules.json`:
   - Every item needs `source.url` (an https official page) and `sourceQuote` (the exact sentence from that page). Don't use agent sites, forums or memory.
   - Set the item's `lastVerified` to the day you checked the page.
   - When an item's meaning changes, bump its `revision`.
   - Always change the file's `version`, for example `2026.11.01-1`. The app only downloads a file whose version differs from the one it has.
3. If an item cites a page with no snapshot yet, or the page has changed, refresh its snapshot (see above) and commit it with the rules change.
4. Run `npm ci`, then `npm run check` and `npm run verify`. To compare with `main` as CI does, run `git show main:v1/rules.json > base.json`, then `node scripts/check.ts v1/rules.json base.json`.
5. Open a pull request. CI fails if a quote isn't in its page's snapshot, the file breaks the schema, a title or detail gives advice, or `version` didn't change. It warns if an item's `detail` changed but its `revision` didn't.
6. Before merging, open every new or changed quote's page and find the quote with Ctrl+F. Pages use curly apostrophes (’).

## Monthly review

Once a month, open every `source.url`, check that its quote is still there and still says what the item claims, then update `lastVerified` (and `revision` if the meaning changed) in one pull request. For the US passport item, also check the State Department's 9 FAM 403.9-3(b)(2)(f), which CBP's bulletin names as the most up-to-date list of exempt countries.

Requires Node 24 or later, which runs the `.ts` files directly.

## Licence of the page text

`snapshots/` and the quotes in `v1/rules.json` reproduce official pages so they can be checked. US government pages (travel.state.gov, the US Embassy in India, CBP) are works of the US government and in the public domain (17 U.S.C. § 105). GOV.UK pages contain public sector information licensed under the [Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/).
