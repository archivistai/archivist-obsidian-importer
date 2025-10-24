import { ItemView, Notice, ProgressBarComponent, TFile, WorkspaceLeaf } from 'obsidian';
import type { Campaign, DocumentKind, ImportRowState } from '../types';
import type ArchivistImporterPlugin from '../main';
import { getLoreSubtypeOptions } from '../loreSubtypes';
import { listCampaigns, createCampaign, createCharacter, createFaction, createItem, createLocation, createLore, createCampaignLink } from '../api';
import { estimateTokens, splitContentIntoChunks } from '../chunker';
import { sanitizeMarkdown } from '../markdownCleaner';

export const VIEW_TYPE_ARCHIVIST = 'archivist-importer-view';

// Extract wiki links and preserve both target title and alias label
function extractWikiLinks(md: string): Array<{ target: string; alias: string }> {
    const result: Array<{ target: string; alias: string }> = [];
    const regex = /!?\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g; // [[target|alias]] or [[target]]
    let m: RegExpExecArray | null;
    while ((m = regex.exec(md)) !== null) {
        const target = (m[1] || '').trim();
        const alias = (m[2] || m[1] || '').trim();
        if (target) result.push({ target, alias });
    }
    return result;
}

export default class ImportView extends ItemView {
    plugin: ArchivistImporterPlugin;
    campaigns: Campaign[] = [];
    selectedCampaignId: string | null = null;
    rows: ImportRowState[] = [];
    lastClickedIndex: number = -1;
    isImporting: boolean = false;
    importProgress: { current: number; total: number } = { current: 0, total: 0 };
    isCreatingLinks: boolean = false;
    linkProgress: { current: number; total: number } = { current: 0, total: 0 };
    isCreatingCampaign: boolean = false;

    // Link tracking: map vault title -> { id, type }
    private createdRecords: Map<string, { id: string; type: 'Character' | 'Item' | 'Location' | 'Faction' }> = new Map();
    // Pending links to materialize after import
    private pendingLinks: Array<{ fromTitle: string; fromType: 'Character' | 'Item' | 'Location' | 'Faction'; links: Array<{ target: string; alias: string }> }> = [];

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
            const data = await listCampaigns({ apiKey: this.plugin.settings.apiKey });
            this.campaigns = data?.data || [];
            this.selectedCampaignId = this.campaigns[0]?.id ?? null;
            this.render();
        } catch (e: any) {
            new Notice(`Failed to load campaigns: ${e.message}`);
        }
    }

    async createNewCampaign() {
        if (!this.plugin.settings.apiKey || this.isCreatingCampaign) return;
        const title = this.app.vault.getName();
        this.isCreatingCampaign = true;
        this.render();
        try {
            const created = await createCampaign({ apiKey: this.plugin.settings.apiKey }, title);
            // refresh list and select created
            await this.refreshCampaigns();
            this.selectedCampaignId = created.id;
        } catch (e: any) {
            new Notice(`Failed to create campaign: ${e.message}`);
        } finally {
            this.isCreatingCampaign = false;
            this.render();
        }
    }

    async loadVaultFiles() {
        const files = this.app.vault.getMarkdownFiles();
        const defaultSubtype = getLoreSubtypeOptions()[0]?.value || 'lore';
        this.rows = files.map((f) => ({
            filePath: f.path,
            title: f.basename,
            size: f.stat.size,
            selected: false,
            kind: 'Lore',
            loreSubtype: defaultSubtype
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

        const campControls = campSection.createEl('div', { cls: 'archivist-campaign-controls' });

        if (this.campaigns.length > 0) {
            const select = campControls.createEl('select', { cls: 'archivist-campaign-select' });
            for (const c of this.campaigns) {
                const opt = select.createEl('option', { text: c.title, value: c.id });
                if (this.selectedCampaignId === c.id) opt.selected = true;
            }
            select.onchange = () => {
                this.selectedCampaignId = select.value || null;
                this.render();
            };
        } else {
            campControls.createEl('div', { text: 'No campaigns found.', cls: 'archivist-no-campaigns' });
        }

        const btnGroup = campControls.createEl('div', { cls: 'archivist-button-group' });
        const createBtn = btnGroup.createEl('button', { cls: 'archivist-create-btn' });
        if (this.isCreatingCampaign) {
            createBtn.setText('Creating...');
            createBtn.disabled = true;
            createBtn.classList.add('archivist-btn-loading');
        } else {
            createBtn.setText('Create New Campaign');
            createBtn.disabled = false;
        }
        createBtn.onclick = () => this.createNewCampaign();
        const refreshBtn = btnGroup.createEl('button', { cls: 'archivist-refresh-btn', attr: { 'aria-label': 'Refresh campaigns' } });
        refreshBtn.innerHTML = '↻';
        refreshBtn.disabled = this.isCreatingCampaign;
        refreshBtn.onclick = () => this.refreshCampaigns();

        const campaignSelected = !!this.selectedCampaignId;

        // Files table
        const filesSection = container.createEl('div', { cls: 'archivist-section' });
        filesSection.createEl('h4', { text: 'Vault Files' });

        const table = filesSection.createEl('table', { cls: 'archivist-table' });
        const thead = table.createEl('thead');
        const headRow = thead.createEl('tr');

        // Header checkbox for select all
        const thSelect = headRow.createEl('th');
        const headerCb = thSelect.createEl('input');
        headerCb.type = 'checkbox';
        headerCb.disabled = !campaignSelected;
        headerCb.checked = this.rows.length > 0 && this.rows.every(r => r.selected);
        headerCb.indeterminate = this.rows.some(r => r.selected) && !this.rows.every(r => r.selected);
        headerCb.onchange = () => {
            const newState = headerCb.checked;
            this.rows.forEach(r => r.selected = newState);
            this.render();
        };

        ['Title', 'Path', 'Size', 'Type', 'Lore Subtype'].forEach((h) => headRow.createEl('th', { text: h }));

        const tbody = table.createEl('tbody');

        for (let i = 0; i < this.rows.length; i++) {
            const row = this.rows[i];
            const tr = tbody.createEl('tr');

            // select
            const tdSel = tr.createEl('td');
            const cb = tdSel.createEl('input');
            cb.type = 'checkbox';
            cb.disabled = !campaignSelected;
            cb.checked = row.selected;
            cb.onclick = (e: MouseEvent) => {
                if (e.shiftKey && this.lastClickedIndex !== -1) {
                    const start = Math.min(this.lastClickedIndex, i);
                    const end = Math.max(this.lastClickedIndex, i);
                    const newState = cb.checked;
                    for (let j = start; j <= end; j++) {
                        this.rows[j].selected = newState;
                    }
                    this.render();
                } else {
                    row.selected = cb.checked;
                    this.lastClickedIndex = i;
                }
            };

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
                // If changed to Lore and no subtype yet, set default
                if (row.kind === 'Lore' && !row.loreSubtype) {
                    row.loreSubtype = getLoreSubtypeOptions()[0]?.value || 'lore';
                }
                this.render();
            };

            // lore subtype conditional
            const tdSubtype = tr.createEl('td');
            if (row.kind === 'Lore') {
                const subSel = tdSubtype.createEl('select');
                const options = getLoreSubtypeOptions();
                if (!row.loreSubtype && options.length) row.loreSubtype = options[0].value;
                for (const o of options) {
                    const opt = subSel.createEl('option', { text: o.label, value: o.value });
                    if (row.loreSubtype === o.value) opt.selected = true;
                }
                subSel.disabled = !campaignSelected;
                subSel.onchange = () => { row.loreSubtype = subSel.value; };
            } else {
                tdSubtype.setText('-');
            }
        }

        // Import button and progress
        const importSection = container.createEl('div', { cls: 'archivist-section' });

        if (this.isImporting) {
            const progressContainer = importSection.createEl('div', { cls: 'archivist-progress-container' });
            progressContainer.createEl('div', {
                text: `Importing ${this.importProgress.current} of ${this.importProgress.total}...`,
                cls: 'archivist-progress-text'
            });
            const progressBar = progressContainer.createEl('div', { cls: 'archivist-progress-bar' });
            const progressFill = progressBar.createEl('div', { cls: 'archivist-progress-fill' });
            const percent = this.importProgress.total > 0
                ? (this.importProgress.current / this.importProgress.total) * 100
                : 0;
            progressFill.style.width = `${percent}%`;
        } else if (this.isCreatingLinks) {
            const progressContainer = importSection.createEl('div', { cls: 'archivist-progress-container' });
            progressContainer.createEl('div', {
                text: `Creating links ${this.linkProgress.current} of ${this.linkProgress.total}...`,
                cls: 'archivist-progress-text'
            });
            const progressBar = progressContainer.createEl('div', { cls: 'archivist-progress-bar' });
            const progressFill = progressBar.createEl('div', { cls: 'archivist-progress-fill' });
            const percent = this.linkProgress.total > 0
                ? (this.linkProgress.current / this.linkProgress.total) * 100
                : 0;
            progressFill.style.width = `${percent}%`;
        } else {
            const importBtn = importSection.createEl('button', { text: 'Import Selected', cls: 'archivist-import-btn' });
            importBtn.disabled = !campaignSelected || this.rows.every(r => !r.selected);
            importBtn.onclick = () => this.importSelected();
        }
    }

    async importSelected() {
        const selected = this.rows.filter(r => r.selected);
        if (!this.selectedCampaignId || selected.length === 0) return;

        // Reset link tracking for this run
        this.createdRecords.clear();
        this.pendingLinks = [];

        this.isImporting = true;
        this.importProgress = { current: 0, total: selected.length };
        this.render();

        const cfg = { apiKey: this.plugin.settings.apiKey };

        for (let i = 0; i < selected.length; i++) {
            const row = selected[i];
            this.importProgress.current = i;
            this.render();

            try {
                row.status = 'uploading';
                const file = this.app.vault.getAbstractFileByPath(row.filePath);
                if (!(file instanceof TFile)) throw new Error('File not found');
                const raw = await this.app.vault.read(file);

                // Extract links before cleaning
                const extracted = extractWikiLinks(raw);
                const content = await sanitizeMarkdown(raw);

                if (row.kind === 'Player Character' || row.kind === 'NPC') {
                    const created: any = await createCharacter(cfg, {
                        campaign_id: this.selectedCampaignId,
                        character_name: row.title,
                        description: content,
                        type: row.kind === 'Player Character' ? 'PC' : 'NPC'
                    });
                    const fromType = 'Character';
                    this.createdRecords.set(row.title, { id: created.id, type: fromType });
                    if (extracted.length) this.pendingLinks.push({ fromTitle: row.title, fromType, links: extracted });
                } else if (row.kind === 'Item') {
                    const created: any = await createItem(cfg, { campaign_id: this.selectedCampaignId, name: row.title, description: content });
                    const fromType = 'Item';
                    this.createdRecords.set(row.title, { id: created.id, type: fromType });
                    if (extracted.length) this.pendingLinks.push({ fromTitle: row.title, fromType, links: extracted });
                } else if (row.kind === 'Location') {
                    const created: any = await createLocation(cfg, { campaign_id: this.selectedCampaignId, name: row.title, description: content });
                    const fromType = 'Location';
                    this.createdRecords.set(row.title, { id: created.id, type: fromType });
                    if (extracted.length) this.pendingLinks.push({ fromTitle: row.title, fromType, links: extracted });
                } else if (row.kind === 'Faction') {
                    const created: any = await createFaction(cfg, { campaign_id: this.selectedCampaignId, name: row.title, description: content });
                    const fromType = 'Faction';
                    this.createdRecords.set(row.title, { id: created.id, type: fromType });
                    if (extracted.length) this.pendingLinks.push({ fromTitle: row.title, fromType, links: extracted });
                } else if (row.kind === 'Lore') {
                    if (!row.loreSubtype) throw new Error('Lore subtype is required');
                    const chunks = splitContentIntoChunks(row.title, content);
                    if (chunks.length === 0) {
                        // Empty file, create one entry
                        await createLore(cfg, {
                            world_id: this.selectedCampaignId,
                            sub_type: row.loreSubtype!,
                            content: '',
                            file_name: row.title + '.md',
                            original_name: row.title + '.md',
                            file_type: 'text/markdown',
                            size: 0
                        });
                    } else {
                        for (let idx = 0; idx < chunks.length; idx++) {
                            const ch = chunks[idx];
                            await createLore(cfg, {
                                world_id: this.selectedCampaignId,
                                sub_type: row.loreSubtype!,
                                content: ch.chunk,
                                file_name: ch.name + '.md',
                                original_name: row.title + (chunks.length > 1 ? ` - ${idx + 1}` : '') + '.md',
                                file_type: 'text/markdown',
                                size: ch.chunk.length
                            });
                        }
                    }
                }
                row.status = 'done';
            } catch (e: any) {
                row.status = 'error';
                row.errorMessage = e.message || String(e);
                new Notice(`Failed importing ${row.title}: ${row.errorMessage}`);
            }
        }

        this.importProgress.current = selected.length;
        this.isImporting = false;

        // After import, materialize links for in-cohort non-Lore references (deduplicated)
        try {
            if (this.pendingLinks.length && this.selectedCampaignId) {
                // Calculate total potential links
                const linksToCreate: Array<{ from: any; targetRec: any; alias: string }> = [];
                const createdLinks = new Set<string>(); // Track "fromId:toId" to dedupe

                for (const entry of this.pendingLinks) {
                    const from = this.createdRecords.get(entry.fromTitle);
                    if (!from) continue;

                    const seenTargets = new Set<string>();
                    for (const { target, alias } of entry.links) {
                        const trimmedTarget = target.trim();
                        const trimmedAlias = (alias || '').trim();
                        if (!trimmedTarget || seenTargets.has(trimmedTarget)) continue;
                        seenTargets.add(trimmedTarget);

                        const targetRec = this.createdRecords.get(trimmedTarget);
                        if (!targetRec) continue;

                        const nonLore = (t: any) => t === 'Character' || t === 'Item' || t === 'Location' || t === 'Faction';
                        if (!nonLore(from.type) || !nonLore(targetRec.type)) continue;
                        if (from.id === targetRec.id) continue;

                        const key = `${from.id}:${targetRec.id}`;
                        if (!createdLinks.has(key)) {
                            linksToCreate.push({ from, targetRec, alias: trimmedAlias || trimmedTarget });
                            createdLinks.add(key);
                        }
                    }
                }

                if (linksToCreate.length > 0) {
                    this.isCreatingLinks = true;
                    this.linkProgress = { current: 0, total: linksToCreate.length };
                    this.render();

                    for (let i = 0; i < linksToCreate.length; i++) {
                        const { from, targetRec, alias } = linksToCreate[i];
                        this.linkProgress.current = i;
                        this.render();

                        await createCampaignLink(cfg, this.selectedCampaignId, {
                            from_id: from.id,
                            from_type: from.type,
                            to_id: targetRec.id,
                            to_type: targetRec.type,
                            alias
                        });
                    }

                    this.linkProgress.current = linksToCreate.length;
                    this.isCreatingLinks = false;
                }
            }
        } catch (e: any) {
            this.isCreatingLinks = false;
            new Notice(`Link creation failed: ${e.message}`);
        }

        this.render();
        new Notice(`Import complete! ${selected.length} file(s) processed.`);
    }
}
