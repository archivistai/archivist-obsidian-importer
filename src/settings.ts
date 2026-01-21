import { App, PluginSettingTab, Setting, TextComponent } from 'obsidian';
import type ArchivistImporterPlugin from './main';

export interface ArchivistSettings {
    apiKey: string;
}

export const DEFAULT_SETTINGS: ArchivistSettings = {
    apiKey: ''
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

        new Setting(containerEl).setName('Configuration').setHeading();

        let pendingApiKey = this.plugin.settings.apiKey;
        let apiKeyInput: TextComponent | null = null;

        new Setting(containerEl)
            .setName('API key')
            .setDesc('Your archivist API key (stored locally in this vault)')
            .addText((text) => {
                apiKeyInput = text;
                text.inputEl.type = 'password';
                text.setPlaceholder('Enter your API key')
                    .setValue(this.plugin.settings.apiKey)
                    .onChange((value) => {
                        pendingApiKey = value.trim();
                    });
            })
            .addButton((button) => {
                button.setButtonText('Save')
                    .setCta()
                    .onClick(async () => {
                        this.plugin.settings.apiKey = pendingApiKey;
                        await this.plugin.saveSettings();
                    });
            })
            .addButton((button) => {
                button.setButtonText('Delete')
                    .setWarning()
                    .onClick(async () => {
                        pendingApiKey = '';
                        this.plugin.settings.apiKey = '';
                        await this.plugin.saveSettings();
                        apiKeyInput?.setValue('');
                    });
            });
    }
}
