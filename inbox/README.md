# inbox

For a page that Firecrawl can't fetch. Save it here, then run `npm run snapshot`. Each file is imported as that page's snapshot and then deleted. Everything here except this README is ignored by git.

- **A page saved from Chrome** (Ctrl+S, "Webpage, HTML only"): it's matched to its address by the page's canonical link, Chrome's "saved from url" note, or its title.
- **Copied text** (Ctrl+A, Ctrl+C into Notepad, saved as `.txt`): put the page's address alone on the first line, then the text.

A file that can't be matched is reported and left here. Import it with `node scripts/snapshot.ts --from <file> <url>` instead.
