# Archivist Obsidian Importer

Import selected Obsidian vault files into your Archivist campaigns.

## Installation (BRAT)

1. Open https://obsidian.md/plugins?id=obsidian42-brat# and click Install.
2. Your browser will ask to open Obsidian; approve it to open the BRAT install window.
3. In Obsidian, click Install for BRAT.
4. Click Enable when it appears.
5. Click Options for BRAT.
6. Click Add Beta Plugin.
7. Paste https://github.com/archivistai/archivist-obsidian-importer and confirm.
8. **Configure API Key:** Go to Settings → Archivist Importer and select or create your Archivist API key in Secret Storage.
9. **Use the plugin:** Click the upload icon in the left ribbon, or use Command Palette (Cmd/Ctrl + P) → "Open import view".

## Quick Copy Script

Development only: use this if you want to build and copy the plugin manually; for normal usage, follow the BRAT install steps in the Installation section. Run `npm install` once in this repository so the Rollup build has its dependencies. The script assumes you run it from the plugin repo folder (where `package.json` lives) so that `npm run build` can find the project.

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

This plugin is prepared for submission to Obsidian Community Plugins and follows the requirements in the Submission Requirements and Developer Policies.

- Repo includes source and metadata (`manifest.json`, `versions.json`, `README.md`, `LICENSE`); release assets (`manifest.json`, `main.js`, `styles.css`) are attached to GitHub releases.
- Uses semantic versioning; `manifest.json` version matches tags/releases and `versions.json` map.
- No obfuscation or minified-only sources; TypeScript sources are included in `src/` and build output is a single `main.js`.
- No elevated privileges; runs in standard Obsidian sandbox. Non-secret settings are stored in the vault (`.obsidian/plugins/archivist-importer/data.json`) and the API key is stored in Obsidian Secret Storage.
- No telemetry or analytics; no tracking libraries.
- Network requests occur only when the user provides an Archivist API key and triggers actions (list campaigns, create campaign, create entities, create links, create journal entries). All requests go to `https://api.myarchivist.ai`.
- Mobile: marked `isDesktopOnly: true` in `manifest.json` to avoid mobile distribution until tested.

For submission steps, follow Obsidian’s docs to create a GitHub release with matching `manifest.json` and open a PR to the community-plugins repo, including the release download URLs.

## Privacy & Data Usage

- What is stored locally: API key in Obsidian Secret Storage and non-secret preferences via Obsidian’s plugin data APIs inside the current vault.
- What is sent to the network: Only when you click actions (list/create campaigns, import records, create links/journal entries). For selected files, the plugin sends:
  - Characters/Items/Locations/Factions: title and cleaned markdown as `description`.
  - Journal entries: title and cleaned markdown content, split if needed to respect API limits.
  - Links: only for imported characters/items/locations/factions, per explicit references detected in the selected notes.
- Where it is sent: `https://api.myarchivist.ai` using your `x-api-key` header.
- No third-party analytics or tracking.
- How to disable: Clear the API key selection in settings and/or disable the plugin. To remove local data, delete `.obsidian/plugins/archivist-importer/` in your vault.

## Release checklist

- Bump `version` in `manifest.json` and add an entry in `versions.json`.
- Update `CHANGELOG.md`.
- Build with `pnpm run build`.
- Create a GitHub release with the built `manifest.json`, `main.js`, and `styles.css` attached.
- Submit/update PR to Obsidian community plugins.

References:
- Submission requirements: https://docs.obsidian.md/Plugins/Releasing/Submission+requirements+for+plugins
- Developer policies: https://docs.obsidian.md/Developer+policies
