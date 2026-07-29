import { ItemView, Notice, ProgressBarComponent, Setting, TFile, WorkspaceLeaf } from 'obsidian';
import type { Campaign, DocumentKind, ImportRowState } from '../types';
import type ArchivistImporterPlugin from '../main';
import { listCampaigns, createCampaign, createCharacter, createFaction, createItem, createLocation, createJournalEntry } from '../api';
import {
    MAX_COMPENDIUM_DESCRIPTION_CHARS,
    isCompendiumDescriptionTooLarge,
    splitContentIntoChunks,
    validateJournalChunk
} from '../chunker';
import { sanitizeMarkdown } from '../markdownCleaner';

export const VIEW_TYPE_ARCHIVIST = 'archivist-importer-view';

const PAGE_SIZE = 100;
const SEARCH_DEBOUNCE_MS = 150;
const IMPORT_RENDER_INTERVAL_MS = 250;
const IMPORT_YIELD_INTERVAL = 10;

type VaultLinkIndex = {
    basenamesByPath: Map<string, string>;
    pathsByBasename: Map<string, string[]>;
};

type LinkResolution =
    | { kind: 'link'; target: string }
    | { kind: 'plain'; text: string; warning?: string };

type SortKey = 'title' | 'filePath' | 'size' | 'kind';
type SortDirection = 'asc' | 'desc';

function stripObsidianSubpath(target: string): string {
    const hashIndex = target.indexOf('#');
    const caretIndex = target.indexOf('^');
    const cutIndexes = [hashIndex, caretIndex].filter((value) => value >= 0);
    const cutIndex = cutIndexes.length > 0 ? Math.min(...cutIndexes) : -1;
    return (cutIndex >= 0 ? target.slice(0, cutIndex) : target).trim();
}

function basenameFromTarget(target: string): string {
    const trimmed = stripObsidianSubpath(target).replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    const basename = trimmed.split('/').filter(Boolean).pop() ?? trimmed;
    return basename.replace(/\.md$/i, '').trim();
}

function normalizeLookupPath(target: string): string {
    return stripObsidianSubpath(target)
        .replace(/\\/g, '/')
        .replace(/^\/+|\/+$/g, '')
        .replace(/\.md$/i, '')
        .toLowerCase();
}

function buildVaultLinkIndex(files: TFile[]): VaultLinkIndex {
    const basenamesByPath = new Map<string, string>();
    const pathsByBasename = new Map<string, string[]>();

    for (const file of files) {
        basenamesByPath.set(normalizeLookupPath(file.path), file.basename);

        const basenameKey = file.basename.toLowerCase();
        const existing = pathsByBasename.get(basenameKey) ?? [];
        existing.push(file.path);
        pathsByBasename.set(basenameKey, existing);
    }

    return { basenamesByPath, pathsByBasename };
}

function resolveWikiTarget(target: string, index: VaultLinkIndex, sourcePath: string): LinkResolution {
    const canonicalTarget = stripObsidianSubpath(target);
    const basename = basenameFromTarget(canonicalTarget);
    if (!basename) {
        return { kind: 'plain', text: target.trim() };
    }

    if (/[\\/]/.test(canonicalTarget)) {
        return {
            kind: 'link',
            target: index.basenamesByPath.get(normalizeLookupPath(canonicalTarget)) ?? basename
        };
    }

    const matchingPaths = index.pathsByBasename.get(basename.toLowerCase()) ?? [];
    if (matchingPaths.length > 1) {
        return {
            kind: 'plain',
            text: basename,
            warning: `Ambiguous bare wikilink [[${basename}]] in ${sourcePath}; flattened to plain text.`
        };
    }

    return { kind: 'link', target: basename };
}

function normalizeWikiLinks(md: string, index: VaultLinkIndex, sourcePath: string): { markdown: string; warnings: string[] } {
    const warnings = new Set<string>();
    const markdown = md.replace(/!?\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (match, rawTargetValue, rawAliasValue) => {
        if (match.startsWith('!')) return '';

        const rawTarget = String(rawTargetValue ?? '').trim();
        const rawAlias = String(rawAliasValue ?? '').trim();
        const fallbackText = rawAlias || basenameFromTarget(rawTarget) || rawTarget;
        const resolved = resolveWikiTarget(rawTarget, index, sourcePath);

        if (resolved.kind === 'plain') {
            if (resolved.warning) warnings.add(resolved.warning);
            return rawAlias || resolved.text || fallbackText;
        }

        if (rawAlias && rawAlias !== resolved.target) {
            return `[[${resolved.target}|${rawAlias}]]`;
        }

        return `[[${resolved.target}]]`;
    });

    return { markdown, warnings: Array.from(warnings) };
}

function nextFrame(): Promise<void> {
    return new Promise((resolve) => globalThis.setTimeout(resolve, 0));
}

export default class ImportView extends ItemView {
    plugin: ArchivistImporterPlugin;
    campaigns: Campaign[] = [];
    selectedCampaignId: string | null = null;
    rows: ImportRowState[] = [];
    searchQuery: string = '';
    sortKey: SortKey | null = null;
    sortDirection: SortDirection = 'asc';
    lastClickedIndex: number = -1;
    isImporting: boolean = false;
    importProgress: { current: number; total: number } = { current: 0, total: 0 };
    isCreatingCampaign: boolean = false;
    currentPage: number = 0;
    private searchDebounceTimer: number | null = null;
    private progressTextEl: HTMLElement | null = null;
    private progressBar: ProgressBarComponent | null = null;

    constructor(leaf: WorkspaceLeaf, plugin: ArchivistImporterPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string { return VIEW_TYPE_ARCHIVIST; }
    getDisplayText(): string { return 'Archivist importer'; }

    async onOpen(): Promise<void> {
        this.render();
        await this.refreshCampaigns();
        this.loadVaultFiles();
    }

    async onClose(): Promise<void> {
        this.clearSearchDebounce();
    }

    async refreshCampaigns() {
        const apiKey = this.plugin.getApiKey();
        if (!apiKey) return;
        try {
            const previousSelectedCampaignId = this.selectedCampaignId;
            const data = await listCampaigns({ apiKey });
            this.campaigns = data?.data || [];
            this.selectedCampaignId = previousSelectedCampaignId && this.campaigns.some((campaign) => campaign.id === previousSelectedCampaignId)
                ? previousSelectedCampaignId
                : this.campaigns[0]?.id ?? null;
            this.render();
        } catch (e: unknown) {
            new Notice(`Failed to load campaigns: ${getErrorMessage(e)}`);
        }
    }

    async createNewCampaign() {
        const apiKey = this.plugin.getApiKey();
        if (!apiKey || this.isCreatingCampaign) return;
        const title = this.app.vault.getName();
        this.isCreatingCampaign = true;
        this.render();
        try {
            const created = await createCampaign({ apiKey }, title);
            await this.refreshCampaigns();
            this.selectedCampaignId = created.id;
        } catch (e: unknown) {
            new Notice(`Failed to create campaign: ${getErrorMessage(e)}`);
        } finally {
            this.isCreatingCampaign = false;
            this.render();
        }
    }

    loadVaultFiles(): void {
        const files = this.app.vault.getMarkdownFiles();
        this.rows = files.map((f) => ({
            filePath: f.path,
            title: f.basename,
            size: f.stat.size,
            selected: false,
            kind: null
        }));
        this.lastClickedIndex = -1;
        this.currentPage = 0;
        this.render();
    }

    resetSelection(): void {
        let changed = false;
        for (const row of this.rows) {
            if (row.selected) {
                row.selected = false;
                changed = true;
            }
        }
        if (this.lastClickedIndex !== -1) {
            this.lastClickedIndex = -1;
            changed = true;
        }
        if (changed) this.render();
    }

    hasSelectedCampaign(): boolean {
        return !!this.selectedCampaignId && this.campaigns.some((campaign) => campaign.id === this.selectedCampaignId);
    }

    hasSelectedRows(): boolean {
        return this.rows.some((row) => row.selected);
    }

    selectedRowsHaveAssignedKinds(): boolean {
        const selectedRows = this.rows.filter((row) => row.selected);
        return selectedRows.length > 0 && selectedRows.every((row) => !!row.kind);
    }

    getSortValue(row: ImportRowState, sortKey: SortKey): string | number {
        switch (sortKey) {
            case 'title':
                return row.title;
            case 'filePath':
                return row.filePath;
            case 'size':
                return row.size;
            case 'kind':
                return row.kind ?? '';
        }
    }

    getSortedRows(rows: Array<{ row: ImportRowState; index: number }>): Array<{ row: ImportRowState; index: number }> {
        if (!this.sortKey) return rows;

        const sortKey = this.sortKey;
        const direction = this.sortDirection === 'asc' ? 1 : -1;

        return [...rows].sort((a, b) => {
            let comparison = 0;

            if (sortKey === 'size') {
                comparison = Number(this.getSortValue(a.row, sortKey)) - Number(this.getSortValue(b.row, sortKey));
            } else {
                const left = this.getSortValue(a.row, sortKey);
                const right = this.getSortValue(b.row, sortKey);
                comparison = String(left).localeCompare(String(right), undefined, { sensitivity: 'base' });
            }

            if (comparison === 0) return a.index - b.index;
            return comparison * direction;
        });
    }

    getFilteredRows(): Array<{ row: ImportRowState; index: number }> {
        const query = this.searchQuery.trim().toLowerCase();
        const filteredRows = this.rows
            .map((row, index) => ({ row, index }))
            .filter(({ row }) => !query || row.title.toLowerCase().includes(query) || row.filePath.toLowerCase().includes(query));
        return this.getSortedRows(filteredRows);
    }

    toggleSort(sortKey: SortKey): void {
        if (this.sortKey === sortKey) {
            this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            this.sortKey = sortKey;
            this.sortDirection = 'asc';
        }
        this.lastClickedIndex = -1;
        this.currentPage = 0;
        this.render();
    }

    getSortIndicator(sortKey: SortKey): string {
        if (this.sortKey !== sortKey) return '';
        return this.sortDirection === 'asc' ? ' ↑' : ' ↓';
    }

    canImport(): boolean {
        return !this.isImporting
            && !this.isCreatingCampaign
            && this.hasSelectedCampaign()
            && this.hasSelectedRows()
            && this.selectedRowsHaveAssignedKinds();
    }

    private clearSearchDebounce(): void {
        if (this.searchDebounceTimer !== null) {
            globalThis.clearTimeout(this.searchDebounceTimer);
            this.searchDebounceTimer = null;
        }
    }

    private scheduleSearchRender(value: string): void {
        this.searchQuery = value;
        this.lastClickedIndex = -1;
        this.currentPage = 0;
        this.clearSearchDebounce();
        // Cast needed: @types/node overrides globalThis.setTimeout return type to
        // NodeJS.Timeout, but Obsidian runs in Electron (browser) where it's always number.
        this.searchDebounceTimer = globalThis.setTimeout(() => {
            this.searchDebounceTimer = null;
            this.render();
        }, SEARCH_DEBOUNCE_MS) as unknown as number;
    }

    private clampCurrentPage(totalRows: number): void {
        const maxPage = Math.max(0, Math.ceil(totalRows / PAGE_SIZE) - 1);
        if (this.currentPage > maxPage) this.currentPage = maxPage;
        if (this.currentPage < 0) this.currentPage = 0;
    }

    private updateProgressDisplay(): void {
        if (this.progressTextEl) {
            this.progressTextEl.setText(`Importing ${this.importProgress.current} of ${this.importProgress.total}...`);
        }
        if (this.progressBar) {
            const value = this.importProgress.total > 0
                ? (this.importProgress.current / this.importProgress.total)
                : 0;
            this.progressBar.setValue(value);
        }
    }

    render() {
        const container = this.contentEl;
        const activeElement = globalThis.document.activeElement;
        const shouldRestoreSearchFocus = activeElement instanceof HTMLInputElement
            && activeElement.classList.contains('archivist-search-input');
        const searchSelectionStart = shouldRestoreSearchFocus ? activeElement.selectionStart : null;
        const searchSelectionEnd = shouldRestoreSearchFocus ? activeElement.selectionEnd : null;
        container.empty();
        this.progressTextEl = null;
        this.progressBar = null;

        new Setting(container).setName('Import overview').setHeading();

        const banner = container.createEl('div');
        if (!this.plugin.getApiKey()) {
            banner.setText('API key missing. Open settings to configure your archivist API key');
            return;
        }

        const campSection = container.createEl('div', { cls: 'archivist-section' });
        new Setting(campSection).setName('Campaign').setHeading();

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
            createBtn.setText('Create new campaign');
            createBtn.disabled = false;
        }
        createBtn.onclick = () => {
            void this.createNewCampaign().catch(() => {
                // Error handling is done in createNewCampaign
            });
        };
        const refreshBtn = btnGroup.createEl('button', { cls: 'archivist-refresh-btn', attr: { 'aria-label': 'Refresh campaigns' } });
        refreshBtn.setText('↻');
        refreshBtn.disabled = this.isCreatingCampaign;
        refreshBtn.onclick = () => {
            void this.refreshCampaigns().catch(() => {
                // Error handling is done in refreshCampaigns
            });
        };

        const campaignSelected = this.hasSelectedCampaign();
        const selectionEnabled = campaignSelected && !this.isCreatingCampaign && !this.isImporting;
        const filteredRows = this.getFilteredRows();
        this.clampCurrentPage(filteredRows.length);
        const selectedCount = this.rows.filter((row) => row.selected).length;
        const pageStart = this.currentPage * PAGE_SIZE;
        const pageRows = filteredRows.slice(pageStart, pageStart + PAGE_SIZE);
        const pageCount = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));

        const filesSection = container.createEl('div', { cls: 'archivist-section' });
        new Setting(filesSection).setName('Vault files').setHeading();

        filesSection.createEl('div', {
            text: `${filteredRows.length.toLocaleString()} matching file(s), ${selectedCount.toLocaleString()} selected. Showing ${pageRows.length.toLocaleString()} per page.`,
            cls: 'archivist-file-summary'
        });

        const searchInput = filesSection.createEl('input', {
            cls: 'archivist-search-input',
            attr: {
                type: 'search',
                placeholder: 'Search document titles or paths'
            }
        });
        searchInput.value = this.searchQuery;
        searchInput.oninput = () => {
            this.scheduleSearchRender(searchInput.value);
        };
        if (shouldRestoreSearchFocus) {
            globalThis.setTimeout(() => {
                searchInput.focus();
                if (searchSelectionStart !== null && searchSelectionEnd !== null) {
                    searchInput.setSelectionRange(searchSelectionStart, searchSelectionEnd);
                }
            }, 0);
        }

        if (filteredRows.length > PAGE_SIZE) {
            const pager = filesSection.createEl('div', { cls: 'archivist-pagination' });
            const prevBtn = pager.createEl('button', { text: 'Previous', cls: 'archivist-page-btn' });
            prevBtn.disabled = this.currentPage === 0;
            prevBtn.onclick = () => {
                this.currentPage -= 1;
                this.lastClickedIndex = -1;
                this.render();
            };
            pager.createEl('span', {
                text: `Page ${this.currentPage + 1} of ${pageCount}`,
                cls: 'archivist-page-label'
            });
            const nextBtn = pager.createEl('button', { text: 'Next', cls: 'archivist-page-btn' });
            nextBtn.disabled = this.currentPage >= pageCount - 1;
            nextBtn.onclick = () => {
                this.currentPage += 1;
                this.lastClickedIndex = -1;
                this.render();
            };
        }

        const table = filesSection.createEl('table', { cls: 'archivist-table' });
        const thead = table.createEl('thead');
        const headRow = thead.createEl('tr');

        const thSelect = headRow.createEl('th');
        const headerCb = thSelect.createEl('input');
        headerCb.type = 'checkbox';
        headerCb.disabled = !selectionEnabled || pageRows.length === 0;
        headerCb.checked = pageRows.length > 0 && pageRows.every(({ row }) => row.selected);
        headerCb.indeterminate = pageRows.some(({ row }) => row.selected) && !pageRows.every(({ row }) => row.selected);
        headerCb.onchange = () => {
            const newState = headerCb.checked;
            pageRows.forEach(({ row }) => {
                row.selected = newState;
            });
            this.render();
        };

        const sortableColumns: Array<{ label: string; key: SortKey }> = [
            { label: 'Title', key: 'title' },
            { label: 'Path', key: 'filePath' },
            { label: 'Size', key: 'size' },
            { label: 'Type', key: 'kind' }
        ];
        for (const column of sortableColumns) {
            const th = headRow.createEl('th');
            const button = th.createEl('button', {
                text: `${column.label}${this.getSortIndicator(column.key)}`,
                cls: 'archivist-sort-btn',
                attr: { type: 'button' }
            });
            button.onclick = () => {
                this.toggleSort(column.key);
            };
        }
        headRow.createEl('th', { text: 'Status' });

        const tbody = table.createEl('tbody');

        for (let visibleIndex = 0; visibleIndex < pageRows.length; visibleIndex++) {
            const { row } = pageRows[visibleIndex];
            const tr = tbody.createEl('tr');

            const tdSel = tr.createEl('td');
            const cb = tdSel.createEl('input');
            cb.type = 'checkbox';
            cb.disabled = !selectionEnabled;
            cb.checked = row.selected;
            cb.onclick = (e: MouseEvent) => {
                if (e.shiftKey && this.lastClickedIndex !== -1) {
                    const start = Math.min(this.lastClickedIndex, visibleIndex);
                    const end = Math.max(this.lastClickedIndex, visibleIndex);
                    const newState = cb.checked;
                    for (let j = start; j <= end; j++) {
                        pageRows[j].row.selected = newState;
                    }
                } else {
                    row.selected = cb.checked;
                }
                this.lastClickedIndex = visibleIndex;
                this.render();
            };

            tr.createEl('td', { text: row.title });
            tr.createEl('td', { text: row.filePath });
            tr.createEl('td', { text: `${row.size}` });

            const tdType = tr.createEl('td');
            const typeSel = tdType.createEl('select');
            const placeholderOpt = typeSel.createEl('option', { text: 'Select type', value: '' });
            placeholderOpt.disabled = true;
            placeholderOpt.selected = row.kind === null;
            const kinds: DocumentKind[] = ['Player Character', 'NPC', 'Item', 'Location', 'Faction', 'Journal Entry'];
            for (const k of kinds) {
                const opt = typeSel.createEl('option', { text: k, value: k });
                if (row.kind === k) opt.selected = true;
            }
            typeSel.disabled = !selectionEnabled;
            typeSel.onchange = () => {
                row.kind = typeSel.value ? typeSel.value as DocumentKind : null;
                this.render();
            };

            const tdStatus = tr.createEl('td', { cls: 'archivist-status-cell' });
            if (row.status === 'uploading') {
                tdStatus.setText('Uploading…');
                tdStatus.addClass('archivist-status-uploading');
            } else if (row.status === 'done') {
                tdStatus.setText('Done');
                tdStatus.addClass('archivist-status-done');
            } else if (row.status === 'error') {
                const msg = row.errorMessage ?? 'Error';
                const truncated = msg.length > 40 ? msg.slice(0, 37) + '…' : msg;
                tdStatus.setText(truncated);
                tdStatus.addClass('archivist-status-error');
                if (msg.length > 40) tdStatus.setAttribute('title', msg);
            }
        }

        if (filteredRows.length === 0) {
            const emptyRow = tbody.createEl('tr');
            const emptyCell = emptyRow.createEl('td', {
                text: 'No documents match your search.',
                attr: { colspan: '6' }
            });
            emptyCell.addClass('archivist-no-results');
        }

        const importSection = container.createEl('div', { cls: 'archivist-section' });

        if (this.isImporting) {
            const progressContainer = importSection.createEl('div', { cls: 'archivist-progress-container' });
            this.progressTextEl = progressContainer.createEl('div', {
                text: `Importing ${this.importProgress.current} of ${this.importProgress.total}...`,
                cls: 'archivist-progress-text'
            });
            this.progressBar = new ProgressBarComponent(progressContainer);
            this.updateProgressDisplay();
        } else {
            const importBtn = importSection.createEl('button', { text: 'Import selected', cls: 'archivist-import-btn' });
            importBtn.disabled = !this.canImport();
            if (this.hasSelectedCampaign() && this.hasSelectedRows() && !this.selectedRowsHaveAssignedKinds()) {
                importSection.createEl('div', {
                    text: 'Assign a document type to every selected file before importing.',
                    cls: 'archivist-import-hint'
                });
            }
            importBtn.onclick = () => {
                void this.importSelected().catch(() => {
                    // Error handling is done in importSelected
                });
            };
        }
    }

    async importSelected() {
        const selected = this.rows.filter(r => r.selected);
        if (!this.selectedCampaignId || selected.length === 0 || selected.some((row) => !row.kind)) return;
        const apiKey = this.plugin.getApiKey();
        if (!apiKey) return;

        this.isImporting = true;
        this.importProgress = { current: 0, total: selected.length };
        this.render();

        const cfg = { apiKey };
        const linkIndex = buildVaultLinkIndex(this.app.vault.getMarkdownFiles());
        let warningCount = 0;
        let lastProgressRender = 0;

        for (let i = 0; i < selected.length; i++) {
            const row = selected[i];
            this.importProgress.current = i;
            this.updateProgressDisplay();

            try {
                row.status = 'uploading';
                row.errorMessage = undefined;
                const file = this.app.vault.getAbstractFileByPath(row.filePath);
                if (!(file instanceof TFile)) throw new Error('File not found');
                const raw = await this.app.vault.read(file);
                const normalizedLinks = normalizeWikiLinks(raw, linkIndex, row.filePath);
                const content = await sanitizeMarkdown(normalizedLinks.markdown);

                if (normalizedLinks.warnings.length > 0) {
                    warningCount += normalizedLinks.warnings.length;
                    const preview = normalizedLinks.warnings.slice(0, 2).join(' ');
                    const suffix = normalizedLinks.warnings.length > 2
                        ? ` (+${normalizedLinks.warnings.length - 2} more)`
                        : '';
                    new Notice(preview + suffix, 8000);
                }

                if (row.kind === 'Player Character' || row.kind === 'NPC') {
                    if (isCompendiumDescriptionTooLarge(content)) {
                        throw new Error(`Description exceeds ${MAX_COMPENDIUM_DESCRIPTION_CHARS.toLocaleString()} characters after cleanup.`);
                    }
                    await createCharacter(cfg, {
                        campaign_id: this.selectedCampaignId,
                        character_name: row.title,
                        description: content,
                        type: row.kind === 'Player Character' ? 'PC' : 'NPC'
                    });
                } else if (row.kind === 'Item') {
                    if (isCompendiumDescriptionTooLarge(content)) {
                        throw new Error(`Description exceeds ${MAX_COMPENDIUM_DESCRIPTION_CHARS.toLocaleString()} characters after cleanup.`);
                    }
                    await createItem(cfg, { campaign_id: this.selectedCampaignId, name: row.title, description: content });
                } else if (row.kind === 'Location') {
                    if (isCompendiumDescriptionTooLarge(content)) {
                        throw new Error(`Description exceeds ${MAX_COMPENDIUM_DESCRIPTION_CHARS.toLocaleString()} characters after cleanup.`);
                    }
                    await createLocation(cfg, { campaign_id: this.selectedCampaignId, name: row.title, description: content });
                } else if (row.kind === 'Faction') {
                    if (isCompendiumDescriptionTooLarge(content)) {
                        throw new Error(`Description exceeds ${MAX_COMPENDIUM_DESCRIPTION_CHARS.toLocaleString()} characters after cleanup.`);
                    }
                    await createFaction(cfg, { campaign_id: this.selectedCampaignId, name: row.title, description: content });
                } else if (row.kind === 'Journal Entry') {
                    const chunks = splitContentIntoChunks(row.title, content);
                    if (chunks.length === 0) {
                        await createJournalEntry(cfg, {
                            world_id: this.selectedCampaignId,
                            title: row.title,
                            content: ''
                        });
                    } else {
                        for (let idx = 0; idx < chunks.length; idx++) {
                            const ch = chunks[idx];
                            const chunkError = validateJournalChunk(ch.chunk);
                            if (chunkError) {
                                throw new Error(`${ch.name}: ${chunkError}.`);
                            }
                            await createJournalEntry(cfg, {
                                world_id: this.selectedCampaignId,
                                title: ch.name,
                                content: ch.chunk
                            });
                        }
                    }
                }
                row.status = 'done';
            } catch (e: unknown) {
                row.status = 'error';
                row.errorMessage = getErrorMessage(e);
                new Notice(`Failed importing ${row.title}: ${row.errorMessage}`);
            }

            this.importProgress.current = i + 1;
            const now = Date.now();
            if (now - lastProgressRender >= IMPORT_RENDER_INTERVAL_MS) {
                lastProgressRender = now;
                this.render();
            } else {
                this.updateProgressDisplay();
            }
            if (i % IMPORT_YIELD_INTERVAL === 0) {
                await nextFrame();
            }
        }

        this.isImporting = false;
        this.render();
        const warningSuffix = warningCount > 0 ? ` ${warningCount} wikilink warning(s).` : '';
        new Notice(`Import complete! ${selected.length} file(s) processed.${warningSuffix}`);
    }
}

function getErrorMessage(e: unknown): string {
    if (e instanceof Error) return e.message;
    if (typeof e === 'string') return e;
    try {
        return JSON.stringify(e);
    } catch {
        return String(e);
    }
}
