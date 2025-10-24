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
