import { ItemView, Notice, ProgressBarComponent, TFile, WorkspaceLeaf } from 'obsidian';
import type { Campaign, DocumentKind, ImportRowState } from '../types';
import type ArchivistImporterPlugin from '../main';
import { getLoreSubtypeOptions } from '../loreSubtypes';
import { listCampaigns, createCampaign, createCharacter, createFaction, createItem, createLocation, createLore } from '../api';
import { estimateTokens, splitContentIntoChunks } from '../chunker';

export const VIEW_TYPE_ARCHIVIST = 'archivist-importer-view';

export default class ImportView extends ItemView {
    plugin: ArchivistImporterPlugin;
    campaigns: Campaign[] = [];
    selectedCampaignId: string | null = null;
    rows: ImportRowState[] = [];

    constructor(leaf: WorkspaceLeaf, plugin: ArchivistImporterPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string { return VIEW_TYPE_ARCHIVIST; }
    getDisplayText(): string { return 'Archivist Importer'; }

    async onOpen(): Promise<void> {
        this.render();
        await this.refreshCampaigns();
        await this.loadVaultFiles();
    }

    async refreshCampaigns() {
        if (!this.plugin.settings.apiKey) return;
        try {
            const data = await listCampaigns({ apiKey: this.plugin.settings.apiKey, baseUrl: this.plugin.settings.baseUrl });
            this.campaigns = data?.data || [];
            this.selectedCampaignId = this.campaigns[0]?.id ?? null;
            this.render();
        } catch (e: any) {
            new Notice(`Failed to load campaigns: ${e.message}`);
        }
    }

    async createNewCampaign() {
        if (!this.plugin.settings.apiKey) return;
        const title = this.app.vault.getName();
        try {
            const created = await createCampaign({ apiKey: this.plugin.settings.apiKey, baseUrl: this.plugin.settings.baseUrl }, title);
            // refresh list and select created
            await this.refreshCampaigns();
            this.selectedCampaignId = created.id;
            this.render();
        } catch (e: any) {
            new Notice(`Failed to create campaign: ${e.message}`);
        }
    }

    async loadVaultFiles() {
        const files = this.app.vault.getMarkdownFiles();
        this.rows = files.map((f) => ({
            filePath: f.path,
            title: f.basename,
            size: f.stat.size,
            selected: false,
            kind: 'Lore'
        }));
        this.render();
    }

    render() {
        const container = this.containerEl.children[1] as HTMLElement;
        container.empty();

        const header = container.createEl('div');
        header.createEl('h3', { text: 'Archivist Importer' });

        const banner = container.createEl('div');
        if (!this.plugin.settings.apiKey) {
            banner.setText('API key missing. Open settings to configure your Archivist API key.');
            return;
        }

        // Campaign controls
        const campSection = container.createEl('div', { cls: 'archivist-section' });
        campSection.createEl('h4', { text: 'Campaign' });

        if (this.campaigns.length > 0) {
            const select = campSection.createEl('select');
            for (const c of this.campaigns) {
                const opt = select.createEl('option', { text: c.title, value: c.id });
                if (this.selectedCampaignId === c.id) opt.selected = true;
            }
            select.onchange = () => {
                this.selectedCampaignId = select.value || null;
                this.render();
            };
        } else {
            campSection.createEl('div', { text: 'No campaigns found.' });
        }

        const btns = campSection.createEl('div');
        const createBtn = btns.createEl('button', { text: 'Create New Campaign' });
        createBtn.onclick = () => this.createNewCampaign();
        const refreshBtn = btns.createEl('button', { text: 'Refresh' });
        refreshBtn.onclick = () => this.refreshCampaigns();

        const campaignSelected = !!this.selectedCampaignId;

        // Files table
        const filesSection = container.createEl('div', { cls: 'archivist-section' });
        filesSection.createEl('h4', { text: 'Vault Files' });

        const table = filesSection.createEl('table', { cls: 'archivist-table' });
        const thead = table.createEl('thead');
        const headRow = thead.createEl('tr');
        ['Select', 'Title', 'Path', 'Size', 'Type', 'Lore Subtype'].forEach((h) => headRow.createEl('th', { text: h }));

        const tbody = table.createEl('tbody');

        for (const row of this.rows) {
            const tr = tbody.createEl('tr');

            // select
            const tdSel = tr.createEl('td');
            const cb = tdSel.createEl('input');
            cb.type = 'checkbox';
            cb.disabled = !campaignSelected;
            cb.checked = row.selected;
            cb.onchange = () => { row.selected = cb.checked; };

            tr.createEl('td', { text: row.title });
            tr.createEl('td', { text: row.filePath });
            tr.createEl('td', { text: `${row.size}` });

            // type
            const tdType = tr.createEl('td');
            const typeSel = tdType.createEl('select');
            const kinds: DocumentKind[] = ['Player Character', 'NPC', 'Item', 'Location', 'Faction', 'Lore'];
            for (const k of kinds) {
                const opt = typeSel.createEl('option', { text: k, value: k });
                if (row.kind === k) opt.selected = true;
            }
            typeSel.disabled = !campaignSelected;
            typeSel.onchange = () => {
                row.kind = typeSel.value as DocumentKind;
                this.render();
            };

            // lore subtype conditional
            const tdSubtype = tr.createEl('td');
            if (row.kind === 'Lore') {
                const subSel = tdSubtype.createEl('select');
                for (const o of getLoreSubtypeOptions()) {
                    const opt = subSel.createEl('option', { text: o.label, value: o.value });
                    if (row.loreSubtype === o.value) opt.selected = true;
                }
                subSel.disabled = !campaignSelected;
                subSel.onchange = () => { row.loreSubtype = subSel.value; };
            } else {
                tdSubtype.setText('-');
            }
        }

        // Import button
        const importSection = container.createEl('div', { cls: 'archivist-section' });
        const importBtn = importSection.createEl('button', { text: 'Import Selected' });
        importBtn.disabled = !campaignSelected || this.rows.every(r => !r.selected);
        importBtn.onclick = () => this.importSelected();
    }

    async importSelected() {
        const selected = this.rows.filter(r => r.selected);
        if (!this.selectedCampaignId) return;

        const cfg = { apiKey: this.plugin.settings.apiKey, baseUrl: this.plugin.settings.baseUrl };

        for (const row of selected) {
            try {
                row.status = 'uploading';
                const file = this.app.vault.getAbstractFileByPath(row.filePath);
                if (!(file instanceof TFile)) throw new Error('File not found');
                const content = await this.app.vault.read(file);

                if (row.kind === 'Player Character' || row.kind === 'NPC') {
                    await createCharacter(cfg, {
                        campaign_id: this.selectedCampaignId,
                        character_name: row.title,
                        description: content,
                        type: row.kind === 'Player Character' ? 'PC' : 'NPC'
                    });
                } else if (row.kind === 'Item') {
                    await createItem(cfg, { campaign_id: this.selectedCampaignId, name: row.title, description: content });
                } else if (row.kind === 'Location') {
                    await createLocation(cfg, { campaign_id: this.selectedCampaignId, name: row.title, description: content });
                } else if (row.kind === 'Faction') {
                    await createFaction(cfg, { campaign_id: this.selectedCampaignId, name: row.title, description: content });
                } else if (row.kind === 'Lore') {
                    if (!row.loreSubtype) throw new Error('Lore subtype is required');
                    const chunks = splitContentIntoChunks(row.title, content);
                    let idx = 0;
                    for (const ch of chunks) {
                        idx++;
                        await createLore(cfg, {
                            world_id: this.selectedCampaignId,
                            sub_type: row.loreSubtype!,
                            content: ch.chunk,
                            file_name: ch.name + '.md',
                            original_name: row.title + (chunks.length > 1 ? ` - ${idx}` : '') + '.md',
                            file_type: 'text/markdown',
                            size: ch.chunk.length
                        });
                    }
                }
                row.status = 'done';
            } catch (e: any) {
                row.status = 'error';
                row.errorMessage = e.message || String(e);
                new Notice(`Failed importing ${row.title}: ${row.errorMessage}`);
            }
            this.render();
        }
    }
}
