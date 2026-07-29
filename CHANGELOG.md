# Changelog

## 0.1.8 - 2026-07-28

- Show a hint when selected files are missing a document type, explaining why the import button stays disabled.

## 0.1.7 - 2026-06-03

- Fix importer freezes and UI lockups in large vaults by paginating the file table (100 rows per page), debouncing the search input, yielding to the main thread every 10 files during import, and skipping the full AST markdown parse for notes over 200 000 characters.
- Add per-row import status display (uploading / done / error with truncated error text and full tooltip) so import progress is visible in the table rather than only in the progress bar.
- Add `typecheck` (`tsc --noEmit`) and `validate:release` scripts; expand `release:check` to run lint, typecheck, build, and release validation in order.
- Add `scripts/validate-release.js` to assert that `package.json`, `manifest.json`, `versions.json`, and `CHANGELOG.md` all agree on the current version before a release.
- Add Vitest and 15 tests for `markdownCleaner.ts` covering the fast path, full AST cleanup, and all Obsidian-specific transformations.
- Update CI workflow to run typecheck and tests before the build step.
- Update release workflow to run typecheck, tests, and release validation before publishing GitHub release assets.

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
