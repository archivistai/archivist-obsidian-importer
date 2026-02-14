import { App, Notice, PluginSettingTab, Setting, SecretComponent } from 'obsidian';
import type ArchivistImporterPlugin from './main';

export interface ArchivistSettings {
    // Deprecated: API key is now stored in Obsidian Secret Storage.
    apiKey?: string;
}

export const DEFAULT_SETTINGS: ArchivistSettings = {
};

export class ArchivistSettingTab extends PluginSettingTab {
    plugin: ArchivistImporterPlugin;

    constructor(app: App, plugin: ArchivistImporterPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        let pendingApiKey = '';
        let apiKeyInput: SecretComponent | null = null;

        const hasStoredKey = !!this.plugin.getApiKey();
        const apiSetting = new Setting(containerEl)
            .setName('API key')
            .setDesc(
                hasStoredKey
                    ? 'API key stored in Obsidian Secret Storage. Use Save to replace or Delete to remove.'
                    : 'Stored in Obsidian Secret Storage (not saved in your vault). Enter your API key and click Save.'
            );

        const secret = new SecretComponent(this.app, apiSetting.controlEl);
        apiKeyInput = secret;
        apiSetting.components.push(secret);
        secret.onChange((value) => {
            pendingApiKey = value.trim();
        });

        apiSetting
            .addButton((button) => {
                button.setButtonText('Save')
                    .setCta()
                    .onClick(async () => {
                        try {
                            if (!pendingApiKey) {
                                if (this.plugin.getApiKey()) {
                                    new Notice('API key unchanged');
                                } else {
                                    new Notice('Enter an API key first');
                                }
                                return;
                            }
                            await this.plugin.setApiKey(pendingApiKey);
                            pendingApiKey = '';
                            apiKeyInput?.setValue('');
                            new Notice('Archivist API key saved');
                            this.display();
                        } catch (e) {
                            const message = e instanceof Error ? e.message : 'Unknown error';
                            new Notice(`Failed to save API key: ${message}`);
                        }
                    });
            })
            .addButton((button) => {
                button.setButtonText('Delete')
                    .setWarning()
                    .onClick(async () => {
                        try {
                            if (!this.plugin.getApiKey()) {
                                new Notice('No API key stored');
                                return;
                            }
                            pendingApiKey = '';
                            await this.plugin.clearApiKey();
                            apiKeyInput?.setValue('');
                            new Notice('Archivist API key deleted');
                            this.display();
                        } catch (e) {
                            const message = e instanceof Error ? e.message : 'Unknown error';
                            new Notice(`Failed to delete API key: ${message}`);
                        }
                    });
            });
    }
}
