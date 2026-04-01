# Archivist Importer

Import selected Obsidian vault files into your Archivist campaigns.

## Installation

1. In Obsidian, open Settings → Community plugins.
2. Turn off Safe mode if prompted.
3. Click Browse and search for `Archivist Importer`.
4. Click Install, then Enable.
5. **Configure API Key:** Go to Settings → Archivist Importer and select or create your Archivist API key in Secret Storage.
6. **Use the plugin:** Click the upload icon in the left ribbon, or use Command Palette (Cmd/Ctrl + P) → `Open import view`.

## Quick Copy Script

Development only: use this if you want to build and copy the plugin manually; for normal usage, install it from Obsidian Community Plugins. Run `npm install` once in this repository so the Rollup build has its dependencies. The script assumes you run it from the plugin repo folder (where `package.json` lives) so that `npm run build` can find the project.

```bash
#!/bin/bash
set -euo pipefail
# Quick deploy script - edit the VAULT_PATH to your vault location
VAULT_PATH="/path/to/your/vault"
PLUGIN_DIR="$VAULT_PATH/.obsidian/plugins/archivist-importer"

npm run build
mkdir -p "$PLUGIN_DIR"
cp manifest.json main.js styles.css "$PLUGIN_DIR/"
echo "✅ Plugin copied to $PLUGIN_DIR"
```

## Development

For active development:
```bash
npm run dev  # watches for changes and rebuilds
```

Then reload the plugin in Obsidian (Settings → Community plugins → disable and re-enable).

## Compliance

This plugin is prepared for submission to Obsidian Community Plugins and follows the current Obsidian submission and plugin guidance.

- Repo includes source and metadata (`manifest.json`, `versions.json`, `README.md`, `LICENSE`); release assets (`manifest.json`, `main.js`, `styles.css`) are attached to GitHub releases.
- Uses semantic versioning; `manifest.json` version matches `package.json` and release tags.
- No obfuscation or minified-only sources; TypeScript sources are included in `src/` and build output is a single `main.js`.
- No elevated privileges; runs in standard Obsidian sandbox. Non-secret settings are stored in the vault (`.obsidian/plugins/archivist-importer/data.json`) and the API key is stored in Obsidian Secret Storage.
- No telemetry or analytics; no tracking libraries.
- Network requests occur only when the user provides an Archivist API key and triggers actions (list campaigns, create campaign, create entities, create journal entries). All requests go to `https://api.myarchivist.ai`.
- Mobile: marked `isDesktopOnly: true` in `manifest.json` to avoid mobile distribution until tested.

See `RELEASING.md` for the current release checklist and automation notes.

## Privacy & Data Usage

- What is stored locally: API key in Obsidian Secret Storage and non-secret preferences via Obsidian’s plugin data APIs inside the current vault.
- What is sent to the network: Only when you click actions (list/create campaigns, import records, create journal entries). For selected files, the plugin sends:
  - Characters/Items/Locations/Factions: title and cleaned markdown as `description`.
  - Journal entries: title and cleaned markdown content, split if needed to respect API limits.
  - Wikilinks embedded in the cleaned markdown can be preserved and normalized before upload so the Archivist API can resolve them server-side.
- Where it is sent: `https://api.myarchivist.ai` using your `x-api-key` header.
- No third-party analytics or tracking.
- How to disable: Clear the API key selection in settings and/or disable the plugin. To remove local data, delete `.obsidian/plugins/archivist-importer/` in your vault.

## Release checklist

- Follow `RELEASING.md`.
- Bump the release version with `npm version patch --no-git-tag-version` (or `minor` / `major`).
- Run `pnpm run lint`.
- Run `pnpm run build`.
- Add the new release to `versions.json` every time.
- Update `CHANGELOG.md`.
- Push an exact-match version tag with no `v` prefix.
- Publish a GitHub release with `manifest.json`, `main.js`, and `styles.css` attached.
- Only open or update an `obsidian-releases` PR for the initial plugin submission or plugin-directory metadata changes.

References:
- Submit your plugin: https://docs.obsidian.md/Plugins/Releasing/Submit%20your%20plugin
- Submission requirements: https://docs.obsidian.md/Plugins/Releasing/Submission%2Brequirements%2Bfor%2Bplugins
- Plugin guidelines: https://docs.obsidian.md/Plugins/Releasing/Plugin%2Bguidelines
- Load-time guide: https://docs.obsidian.md/Plugins/Guides/Optimizing+plugin+load+time
- Sample plugin: https://github.com/obsidianmd/obsidian-sample-plugin
