import { App, PluginSettingTab, Setting } from 'obsidian';
import type ArchivistImporterPlugin from './main';

export interface ArchivistSettings {
    apiKey: string;
    baseUrl: string;
}

export const DEFAULT_SETTINGS: ArchivistSettings = {
    apiKey: '',
    baseUrl: 'https://api.myarchivist.ai'
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

        containerEl.createEl('h2', { text: 'Archivist Importer Settings' });

        new Setting(containerEl)
            .setName('API Key')
            .setDesc('Your Archivist API Key (stored locally in this vault).')
            .addText((text) => {
                text.inputEl.type = 'password';
                text.setPlaceholder('archivist_...')
                    .setValue(this.plugin.settings.apiKey)
                    .onChange(async (value) => {
                        this.plugin.settings.apiKey = value.trim();
                        await this.plugin.saveSettings();
                    });
            });

        new Setting(containerEl)
            .setName('API Base URL')
            .setDesc('Override only if using a custom endpoint.')
            .addText((text) => {
                text.setPlaceholder('https://api.myarchivist.ai')
                    .setValue(this.plugin.settings.baseUrl)
                    .onChange(async (value) => {
                        this.plugin.settings.baseUrl = value.trim() || 'https://api.myarchivist.ai';
                        await this.plugin.saveSettings();
                    });
            });
    }
}
