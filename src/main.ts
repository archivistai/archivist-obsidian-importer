import { Plugin, WorkspaceLeaf } from 'obsidian';
import { ArchivistSettingTab, DEFAULT_SETTINGS, type ArchivistSettings } from './settings';
import ImportView, { VIEW_TYPE_ARCHIVIST } from './view/ImportView';

export default class ArchivistImporterPlugin extends Plugin {
    settings!: ArchivistSettings;

    async onload() {
        await this.loadSettings();

        this.registerView(
            VIEW_TYPE_ARCHIVIST,
            (leaf: WorkspaceLeaf) => new ImportView(leaf, this)
        );

        this.addRibbonIcon('upload', 'Open Archivist Importer', () => {
            this.activateView();
        });

        this.addCommand({
            id: 'open-archivist-importer',
            name: 'Open Archivist Importer',
            callback: () => this.activateView()
        });

        this.addSettingTab(new ArchivistSettingTab(this.app, this));
    }

    async onunload() { }

    async activateView() {
        const { workspace } = this.app;
        let leaf = workspace.getLeavesOfType(VIEW_TYPE_ARCHIVIST)[0];
        if (!leaf) {
            const rightLeaf = workspace.getRightLeaf(false);
            if (!rightLeaf) return;
            leaf = rightLeaf;
            await leaf.setViewState({ type: VIEW_TYPE_ARCHIVIST, active: true });
        }
        workspace.revealLeaf(leaf);
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}
