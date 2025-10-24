# Archivist Obsidian Importer

Import selected Obsidian vault files into your Archivist campaigns.

## Installation (Development/Testing)

1. **Build the plugin:**
   ```bash
   npm install
   npm run build
   ```

2. **Copy to your vault:**
   ```bash
   # Find your vault's plugins folder (usually at YourVault/.obsidian/plugins/)
   # Create the plugin folder:
   mkdir -p /path/to/YourVault/.obsidian/plugins/archivist-importer
   
   # Copy these files to the plugin folder:
   cp manifest.json /path/to/YourVault/.obsidian/plugins/archivist-importer/
   cp main.js /path/to/YourVault/.obsidian/plugins/archivist-importer/
   cp styles.css /path/to/YourVault/.obsidian/plugins/archivist-importer/
   ```

3. **Enable the plugin:**
   - Open Obsidian
   - Go to Settings → Community plugins
   - Turn OFF "Restricted mode" if it's on
   - Find "Archivist Importer" in the installed plugins list
   - Toggle it on

4. **Configure API Key:**
   - Go to Settings → Archivist Importer
   - Enter your Archivist API key
   - (Optional) Change the base URL if using a custom endpoint

5. **Use the plugin:**
   - Click the upload icon in the left ribbon, or
   - Use Command Palette (Cmd/Ctrl + P) → "Open Archivist Importer"

## Quick Copy Script

```bash
#!/bin/bash
# Quick deploy script - edit the VAULT_PATH to your vault location
VAULT_PATH="/path/to/your/vault"
PLUGIN_DIR="$VAULT_PATH/.obsidian/plugins/archivist-importer"

npm run build && \
mkdir -p "$PLUGIN_DIR" && \
cp manifest.json main.js styles.css "$PLUGIN_DIR/" && \
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

- Files included at repo root: `manifest.json`, `versions.json`, `main.js`, `README.md`, `LICENSE`.
- Uses semantic versioning; `manifest.json` version matches tags/releases and `versions.json` map.
- No obfuscation or minified-only sources; TypeScript sources are included in `src/` and build output is a single `main.js`.
- No elevated privileges; runs in standard Obsidian sandbox and stores settings only in the vault (`.obsidian/plugins/archivist-importer/data.json`).
- No telemetry or analytics; no tracking libraries.
- Network requests occur only when the user provides an Archivist API key and triggers actions (list campaigns, create campaign, create entities, create links, create lore). All requests go to `https://api.myarchivist.ai`.
- Mobile: marked `isDesktopOnly: true` in `manifest.json` to avoid mobile distribution until tested.

For submission steps, follow Obsidian’s docs to create a GitHub release with matching `manifest.json` and open a PR to the community-plugins repo, including the release download URLs.

## Privacy & Data Usage

- What is stored locally: API key and basic preferences via Obsidian’s plugin data APIs inside the current vault.
- What is sent to the network: Only when you click actions (list/create campaigns, import records, create links/lore). For selected files, the plugin sends:
  - Characters/Items/Locations/Factions: title and cleaned markdown as `description`.
  - Lore: cleaned markdown content, subtype key, and file metadata per Archivist API.
  - Links: only for imported non-Lore entities, per explicit references detected in the selected notes.
- Where it is sent: `https://api.myarchivist.ai` using your `x-api-key` header.
- No third-party analytics or tracking.
- How to disable: Remove API key in settings and/or disable the plugin. To remove local data, delete `.obsidian/plugins/archivist-importer/` in your vault.

## Release checklist

- Bump `version` in `manifest.json` and add an entry in `versions.json`.
- Update `CHANGELOG.md`.
- Build with `pnpm run build`.
- Create a GitHub release with the built `manifest.json` and `main.js` attached.
- Submit/update PR to Obsidian community plugins.

References:
- Submission requirements: https://docs.obsidian.md/Plugins/Releasing/Submission+requirements+for+plugins
- Developer policies: https://docs.obsidian.md/Developer+policies
