# Changelog

## 0.1.6 - 2026-04-01

- Preserve focus and cursor position in the importer title search field while filtering results.
- Update installation instructions to use Obsidian Community Plugins instead of the legacy BRAT beta flow.

## 0.1.5 - 2026-03-31

- Fix importer button enablement so it reacts correctly to campaign selection and row selection, including on initial load.
- Require selected rows to have an explicit document type instead of defaulting uploads to `Journal Entry`.
- Add case-insensitive title search, shift-click range selection, and sortable table columns in the importer view.

## 0.1.4 - 2026-03-26

- Align importer behavior with current Archivist API record creation and link syncing.
- Stop creating manual client-side links after import and preserve normalized wikilinks for API-side resolution.
- Add retry and bounded backoff for rate-limited and transient API failures.
- Add importer preflight checks for compendium and journal size limits.
- Normalize Obsidian wikilinks more safely by ignoring embeds, resolving path-qualified targets, and warning on ambiguous bare-note targets.
- Replace brittle Obsidian view DOM access with `contentEl`.
- Add local release automation support: lint script, version-bump script, GitHub Actions CI, and a GitHub Actions release workflow.
