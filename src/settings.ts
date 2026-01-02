import { App, PluginSettingTab, Setting } from 'obsidian';
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

        new Setting(containerEl).setName('Archivist importer').setHeading();

        new Setting(containerEl)
            .setName('API key')
            .setDesc('Your Archivist API key (stored locally in this vault).')
            .addText((text) => {
                text.inputEl.type = 'password';
                text.setPlaceholder('archivist_...')
                    .setValue(this.plugin.settings.apiKey)
                    .onChange(async (value) => {
                        this.plugin.settings.apiKey = value.trim();
                        await this.plugin.saveSettings();
                    });
            });
    }
}
