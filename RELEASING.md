# Releasing Archivist Importer

This checklist was reviewed against the official Obsidian developer documentation on 2026-03-26.

Official sources:

- https://docs.obsidian.md/Plugins/Releasing/Submit%20your%20plugin
- https://docs.obsidian.md/oo/plugin
- https://docs.obsidian.md/plugins/guides/load-time
- https://github.com/obsidianmd/obsidian-sample-plugin

## Official release checklist

1. Make sure the repository root contains `README.md`, `LICENSE`, and `manifest.json`.
2. Keep README disclosures current for network use, account requirements, file access, tracking, and any other user-sensitive behavior.
3. Confirm the plugin still follows the current Obsidian plugin guidance and lint it with the Obsidian ESLint rules.
4. Produce a production build so the release asset `main.js` is built from the current source.
5. Bump the plugin version using strict `x.y.z` semantic versioning.
6. Keep `package.json` and `manifest.json` on the exact same version.
7. Update `manifest.json` `minAppVersion` when the release requires a newer Obsidian build.
8. Add the release version to `versions.json` for every release, mapping it to the current `minAppVersion`, so older Obsidian versions can stay on a compatible plugin version later.
9. Update `CHANGELOG.md` for the release.
10. Tag the release with the exact version string. Do not prefix the tag with `v`.
11. Publish a GitHub release that includes `manifest.json`, `main.js`, and `styles.css` as assets.
12. Only touch the community-plugins repository for the initial submission or if plugin-directory metadata needs to change.

## Repo automation and commands

- Bump version: `npm version patch --no-git-tag-version`
- Lint: `pnpm run lint`
- Build: `pnpm run build`
- Local release verification: `pnpm run release:check`

GitHub Actions in this repo:

- `.github/workflows/ci.yml` runs lint and build on pushes and pull requests.
- `.github/workflows/release.yml` runs lint/build on version tags and creates a GitHub release with the required assets.

## 0.1.4 release status

Completed locally on 2026-03-26:

- Source changes implemented.
- `package.json` and `manifest.json` bumped to `0.1.4`.
- `versions.json` updated with `0.1.4`.
- README disclosures updated to match the current importer behavior.
- `CHANGELOG.md` updated.
- Obsidian ESLint run completed.
- Production build completed.
- CI and release workflows added.

Manual GitHub steps still required:

- Push commit(s).
- Push tag `0.1.4`.
- Confirm the GitHub Actions release workflow publishes the release assets.
- If this plugin is being newly listed publicly, open the initial PR to `obsidianmd/obsidian-releases`.
