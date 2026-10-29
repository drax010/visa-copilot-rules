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
- `inbox/`: where to save a page by hand when Firecrawl can't fetch it.
- `.github/workflows/monthly-review.yml` and `scripts/review.ts`: the monthly review (see below).

## Snapshots and the quote check

- `npm run snapshot` refreshes every cited page. Add page addresses after it (`npm run snapshot -- <url> <url>`) to refresh only those.
- Firecrawl needs an API key: set `FIRECRAWL_API_KEY`, or `FIRECRAWL_KEY_FILE` to the path of a file holding it. Keep the file outside this repo; the key is never printed. Each page costs 1 credit, and the script waits 7 seconds between pages (the free plan allows 10 a minute).
- An almost empty answer is fetched once more through Firecrawl's enhanced proxy: travel.state.gov often gives the basic proxy a blank page with status 200, which `proxy: "auto"` doesn't retry.
- A page that fails (an error, a block page, an answer still almost empty, or a copy under half the size of its last snapshot) keeps its previous snapshot, and the run exits 1.
- If Firecrawl can't fetch a page, save it from Chrome into `inbox/` and run `npm run snapshot` again (see `inbox/README.md`), or import it directly: `node scripts/snapshot.ts --from <saved .html or .txt> <url> [method]`.
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

`.github/workflows/monthly-review.yml` runs at 06:00 UTC on the 1st of each month. To run it now, open Actions, pick "Monthly review", then "Run workflow". It:

1. fetches every cited page again (about 6 Firecrawl credits) and checks every quote;
2. sets `lastVerified` to today (India's date) for each item whose page was fetched and whose quote was found, and gives the file a new `version` (`scripts/review.ts`). An item whose page couldn't be fetched keeps its old date, because nobody checked it against the live page;
3. runs the same checks as CI;
4. opens a pull request, "Monthly review YYYY-MM". Its body lists pages that couldn't be fetched, items whose quote is missing, pages whose text changed, the check results and the Firecrawl credits left. If a quote is missing, the pull request is a draft.

The run ends red, and GitHub emails you, if a page, a quote or a check failed. GitHub doesn't run `check.yml` on a pull request opened by a workflow, so the checks in the body are the ones to read; any later push to the branch runs `check.yml` as usual.

Before merging:

- **Read every changed page** in Files changed. A page can change what an item should say even when its quote is still there; then fix the item and bump its `revision`.
- **A page that couldn't be fetched:** check out the branch, save the page into `inbox/`, then run `npm run snapshot`, then `git show main:v1/rules.json > base.json` and `node scripts/review.ts bump --since <a time before the import> --base base.json`, and push.
- **A missing quote:** run `/redraft-rules` in Claude Code on the branch, or fix the item by hand, then push.
- **The US passport item:** also check the State Department's 9 FAM 403.9-3(b)(2)(f), which CBP's bulletin names as the most up-to-date list of exempt countries.

Merging is the sign-off. Merge each month's pull request: GitHub turns off scheduled workflows in a public repo after 60 days with no activity (it emails first), and the merge counts as activity.

The workflow reads the Firecrawl key from the repo secret `FIRECRAWL_API_KEY`. It opens pull requests only because the repo setting "Allow GitHub Actions to create and approve pull requests" is on (Settings → Actions → General).

Requires Node 24 or later, which runs the `.ts` files directly.

## Licence of the page text

`snapshots/` and the quotes in `v1/rules.json` reproduce official pages so they can be checked. US government pages (travel.state.gov, the US Embassy in India, CBP) are works of the US government and in the public domain (17 U.S.C. § 105). GOV.UK pages contain public sector information licensed under the [Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/).
