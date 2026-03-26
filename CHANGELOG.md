# Changelog

## 0.1.4 - 2026-03-26

- Align importer behavior with current Archivist API record creation and link syncing.
- Stop creating manual client-side links after import and preserve normalized wikilinks for API-side resolution.
- Add retry and bounded backoff for rate-limited and transient API failures.
- Add importer preflight checks for compendium and journal size limits.
- Normalize Obsidian wikilinks more safely by ignoring embeds, resolving path-qualified targets, and warning on ambiguous bare-note targets.
- Replace brittle Obsidian view DOM access with `contentEl`.
- Add local release automation support: lint script, version-bump script, GitHub Actions CI, and a GitHub Actions release workflow.
