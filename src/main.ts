import { Plugin, WorkspaceLeaf } from 'obsidian';
import { ArchivistSettingTab, DEFAULT_SETTINGS, type ArchivistSettings } from './settings';
import ImportView, { VIEW_TYPE_ARCHIVIST } from './view/ImportView';

export default class ArchivistImporterPlugin extends Plugin {
    settings!: ArchivistSettings;

    onload(): void {
        void this.onloadAsync();
    }

    private async onloadAsync(): Promise<void> {
        await this.loadSettings();

        this.registerView(
            VIEW_TYPE_ARCHIVIST,
            (leaf: WorkspaceLeaf) => new ImportView(leaf, this)
        );

        this.addRibbonIcon('upload', 'Open import view', () => {
            void this.activateView().catch(() => {
                // Error handling is done in activateView if needed
            });
        });

        this.addCommand({
            id: 'open-import-view',
            name: 'Open import view',
            callback: () => {
                void this.activateView().catch(() => {
                    // Error handling is done in activateView if needed
                });
            }
        });

        this.addSettingTab(new ArchivistSettingTab(this.app, this));
    }

    onunload(): void { }

    async activateView(): Promise<void> {
        const { workspace } = this.app;
        let leaf = workspace.getLeavesOfType(VIEW_TYPE_ARCHIVIST)[0];
        if (!leaf) {
            const rightLeaf = workspace.getRightLeaf(false);
            if (!rightLeaf) return;
            leaf = rightLeaf;
            await leaf.setViewState({ type: VIEW_TYPE_ARCHIVIST, active: true });
        }
        void workspace.revealLeaf(leaf);
        const view = leaf.view;
        if (view instanceof ImportView) {
            view.resetSelection();
        }
    }

    async loadSettings(): Promise<void> {
        const data = await this.loadData() as Partial<ArchivistSettings> | null;
        this.settings = Object.assign({}, DEFAULT_SETTINGS, data ?? {});
        await this.migrateLegacyApiKey();
    }

    async saveSettings(): Promise<void> {
        await this.saveData(this.settings);
        this.refreshImportViews();
    }

    getApiKey(): string | null {
        const secretId = this.settings.apiKey?.trim();
        if (!secretId) return null;
        const raw = this.app.secretStorage.getSecret(secretId);
        if (raw === null) return null;
        const trimmed = raw.trim();
        return trimmed.length > 0 ? trimmed : null;
    }

    private async migrateLegacyApiKey(): Promise<void> {
        const legacyValue = this.settings.apiKey?.trim();
        if (!legacyValue) return;
        const existing = this.app.secretStorage.getSecret(legacyValue);
        if (existing !== null) return;

        const defaultSecretId = 'archivist-importer-api-key';
        const current = this.app.secretStorage.getSecret(defaultSecretId);
        if (current === null) {
            this.app.secretStorage.setSecret(defaultSecretId, legacyValue);
        }
        this.settings.apiKey = defaultSecretId;
        await this.saveData(this.settings);
    }

    private refreshImportViews(): void {
        const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_ARCHIVIST);
        for (const leaf of leaves) {
            const view = leaf.view;
            if (view instanceof ImportView) {
                view.render();
                void view.refreshCampaigns().catch(() => {
                    // Error handling is done in refreshCampaigns if needed
                });
            }
        }
    }
}
