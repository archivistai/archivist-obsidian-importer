import { App, PluginSettingTab, SecretComponent, Setting } from 'obsidian';
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

        new Setting(containerEl)
            .setName('API key')
            .setDesc('Select a secret from Obsidian secret storage')
            .addComponent((el) => new SecretComponent(this.app, el)
                .setValue(this.plugin.settings.apiKey)
                .onChange((value) => {
                    this.plugin.settings.apiKey = value;
                    void this.plugin.saveSettings();
                }));
    }
}
