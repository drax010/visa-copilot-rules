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
- `scripts/check.ts`: the checker. CI runs it on every pull request and every push to `main`.

## Changing the rules

1. Branch from `main`. Never edit `main` directly; the app picks up whatever is there.
2. Edit `v1/rules.json`:
   - Every item needs `source.url` (an https official page) and `sourceQuote` (the exact sentence from that page). Don't use agent sites, forums or memory.
   - Set the item's `lastVerified` to the day you checked the page.
   - When an item's meaning changes, bump its `revision`.
   - Always change the file's `version`, for example `2026.11.01-1`. The app only downloads a file whose version differs from the one it has.
3. Run `npm ci`, then `npm run check`. To compare with `main` as CI does, run `git show main:v1/rules.json > base.json`, then `node scripts/check.ts v1/rules.json base.json`.
4. Open a pull request. CI fails if the file breaks the schema or `version` didn't change. It warns if an item's `detail` changed but its `revision` didn't.
5. Before merging, open every new or changed quote's page and find the quote with Ctrl+F. Pages use curly apostrophes (’).

## Monthly review

Once a month, open every `source.url`, check that its quote is still there and still says what the item claims, then update `lastVerified` (and `revision` if the meaning changed) in one pull request. For the US passport item, also check the State Department's 9 FAM 403.9-3(b)(2)(f), which CBP's bulletin names as the most up-to-date list of exempt countries.

Requires Node 24 or later, which runs the `.ts` files directly.
