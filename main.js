'use strict';

var obsidian = require('obsidian');

const DEFAULT_SETTINGS = {
    apiKey: '',
    baseUrl: 'https://api.myarchivist.ai'
};
class ArchivistSettingTab extends obsidian.PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }
    display() {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl('h2', { text: 'Archivist Importer Settings' });
        new obsidian.Setting(containerEl)
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
        new obsidian.Setting(containerEl)
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

const LORE_SUBTYPES = {
    worldHistory: 'World History',
    timeline: 'Timeline',
    calendar: 'Calendar & Holidays',
    geography: 'Geography & Maps',
    climate: 'Climate & Weather',
    cosmology: 'Cosmology & Planes',
    magic: 'Magic System',
    technology: 'Technology Level',
    pantheon: 'Pantheon & Deities',
    religion: 'Religious Orders',
    mythology: 'Myths & Legends',
    culture: 'Cultural Notes',
    languages: 'Languages & Scripts',
    customs: 'Customs & Traditions',
    festivals: 'Festivals & Celebrations',
    politics: 'Political Systems',
    nobility: 'Noble Houses',
    guilds: 'Guilds & Organizations',
    laws: 'Laws & Legal System',
    trade: 'Trade & Economy',
    currency: 'Currency & Commerce',
    wars: 'Wars & Conflicts',
    disasters: 'Disasters & Catastrophes',
    discoveries: 'Important Discoveries',
    inventions: 'Notable Inventions',
    dynasties: 'Dynasties & Succession',
    races: 'Races & Species',
    monsters: 'Monsters & Creatures',
    wildlife: 'Flora & Fauna',
    dragons: 'Dragons & Ancient Beings',
    artifacts: 'Legendary Artifacts',
    weapons: 'Notable Weapons',
    items: 'Important Items',
    treasures: 'Treasures & Valuables',
    prophecies: 'Prophecies & Omens',
    secrets: 'Hidden Knowledge',
    lore: 'Ancient Lore',
    research: 'Research Notes',
    spells: 'Spells & Rituals',
    alchemy: 'Alchemy & Crafting',
    adventure: 'Adventure Hooks',
    plots: 'Plot Threads',
    npcs: 'Important NPCs',
    rules: 'House Rules',
    references: 'Quick References',
    other: 'Other/Miscellaneous'
};
const getLoreSubtypeOptions = () => Object.entries(LORE_SUBTYPES).map(([value, label]) => ({ value, label }));

async function apiFetch(config, path, init) {
    const res = await fetch(`${config.baseUrl}${path}`, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': config.apiKey
        },
        ...init
    });
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`${res.status} ${res.statusText} - ${text}`);
    }
    if (res.status === 204)
        return undefined;
    return (await res.json());
}
async function listCampaigns(config) { return apiFetch(config, `/v1/campaigns?page=1&size=100`); }
async function createCampaign(config, title) {
    return apiFetch(config, `/v1/campaigns`, {
        method: 'POST',
        body: JSON.stringify({ title })
    });
}
async function createCharacter(config, payload) {
    return apiFetch(config, `/v1/characters`, {
        method: 'POST',
        body: JSON.stringify(payload)
    });
}
async function createItem(config, payload) {
    return apiFetch(config, `/v1/items`, { method: 'POST', body: JSON.stringify(payload) });
}
async function createLocation(config, payload) {
    return apiFetch(config, `/v1/locations`, { method: 'POST', body: JSON.stringify(payload) });
}
async function createFaction(config, payload) {
    return apiFetch(config, `/v1/factions`, { method: 'POST', body: JSON.stringify(payload) });
}
async function createLore(config, payload) {
    return apiFetch(config, `/v1/lore`, { method: 'POST', body: JSON.stringify(payload) });
}

const MAX_CHARS = 1900000; // below 2,000,000 server limit
const MAX_TOKENS = 30000; // safety bound to avoid world cap spikes
function estimateTokens(text) {
    if (!text)
        return 0;
    // heuristic: ~4 chars per token
    return Math.ceil(text.length / 4);
}
function splitContentIntoChunks(title, content) {
    if (!content)
        return [];
    // If content is small, return as single chunk
    if (content.length <= MAX_CHARS && estimateTokens(content) <= MAX_TOKENS) {
        return [{ name: title, chunk: content }];
    }
    // Prefer splitting by headings or paragraphs
    const blocks = content.split(/\n(?=#+\s|\s*$)/g); // split at markdown headings where possible
    const chunks = [];
    let current = [];
    let currentChars = 0;
    let currentTokens = 0;
    function flush() {
        if (current.length === 0)
            return;
        const chunkText = current.join('\n');
        chunks.push({ name: `${title} - ${chunks.length + 1}`, chunk: chunkText });
        current = [];
        currentChars = 0;
        currentTokens = 0;
    }
    for (const block of blocks) {
        const blockChars = block.length + 1;
        const blockTokens = estimateTokens(block);
        if (currentChars + blockChars > MAX_CHARS || currentTokens + blockTokens > MAX_TOKENS) {
            flush();
        }
        current.push(block);
        currentChars += blockChars;
        currentTokens += blockTokens;
    }
    flush();
    // Fallback to hard split if any chunk still violates bounds
    const normalized = [];
    for (const { name, chunk } of chunks) {
        if (chunk.length <= MAX_CHARS && estimateTokens(chunk) <= MAX_TOKENS) {
            normalized.push({ name, chunk });
            continue;
        }
        for (let i = 0; i < chunk.length; i += MAX_CHARS) {
            const part = chunk.slice(i, i + MAX_CHARS);
            normalized.push({ name: `${name}`, chunk: part });
        }
    }
    // Rename sequentially 1..N
    return normalized.map((c, idx) => ({ name: `${title} - ${idx + 1}`, chunk: c.chunk }));
}

const VIEW_TYPE_ARCHIVIST = 'archivist-importer-view';
class ImportView extends obsidian.ItemView {
    constructor(leaf, plugin) {
        super(leaf);
        this.campaigns = [];
        this.selectedCampaignId = null;
        this.rows = [];
        this.plugin = plugin;
    }
    getViewType() { return VIEW_TYPE_ARCHIVIST; }
    getDisplayText() { return 'Archivist Importer'; }
    async onOpen() {
        this.render();
        await this.refreshCampaigns();
        await this.loadVaultFiles();
    }
    async refreshCampaigns() {
        var _a, _b;
        if (!this.plugin.settings.apiKey)
            return;
        try {
            const data = await listCampaigns({ apiKey: this.plugin.settings.apiKey, baseUrl: this.plugin.settings.baseUrl });
            this.campaigns = (data === null || data === void 0 ? void 0 : data.data) || [];
            this.selectedCampaignId = (_b = (_a = this.campaigns[0]) === null || _a === void 0 ? void 0 : _a.id) !== null && _b !== void 0 ? _b : null;
            this.render();
        }
        catch (e) {
            new obsidian.Notice(`Failed to load campaigns: ${e.message}`);
        }
    }
    async createNewCampaign() {
        if (!this.plugin.settings.apiKey)
            return;
        const title = this.app.vault.getName();
        try {
            const created = await createCampaign({ apiKey: this.plugin.settings.apiKey, baseUrl: this.plugin.settings.baseUrl }, title);
            // refresh list and select created
            await this.refreshCampaigns();
            this.selectedCampaignId = created.id;
            this.render();
        }
        catch (e) {
            new obsidian.Notice(`Failed to create campaign: ${e.message}`);
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
        const container = this.containerEl.children[1];
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
                if (this.selectedCampaignId === c.id)
                    opt.selected = true;
            }
            select.onchange = () => {
                this.selectedCampaignId = select.value || null;
                this.render();
            };
        }
        else {
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
            const kinds = ['Player Character', 'NPC', 'Item', 'Location', 'Faction', 'Lore'];
            for (const k of kinds) {
                const opt = typeSel.createEl('option', { text: k, value: k });
                if (row.kind === k)
                    opt.selected = true;
            }
            typeSel.disabled = !campaignSelected;
            typeSel.onchange = () => {
                row.kind = typeSel.value;
                this.render();
            };
            // lore subtype conditional
            const tdSubtype = tr.createEl('td');
            if (row.kind === 'Lore') {
                const subSel = tdSubtype.createEl('select');
                for (const o of getLoreSubtypeOptions()) {
                    const opt = subSel.createEl('option', { text: o.label, value: o.value });
                    if (row.loreSubtype === o.value)
                        opt.selected = true;
                }
                subSel.disabled = !campaignSelected;
                subSel.onchange = () => { row.loreSubtype = subSel.value; };
            }
            else {
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
        if (!this.selectedCampaignId)
            return;
        const cfg = { apiKey: this.plugin.settings.apiKey, baseUrl: this.plugin.settings.baseUrl };
        for (const row of selected) {
            try {
                row.status = 'uploading';
                const file = this.app.vault.getAbstractFileByPath(row.filePath);
                if (!(file instanceof obsidian.TFile))
                    throw new Error('File not found');
                const content = await this.app.vault.read(file);
                if (row.kind === 'Player Character' || row.kind === 'NPC') {
                    await createCharacter(cfg, {
                        campaign_id: this.selectedCampaignId,
                        character_name: row.title,
                        description: content,
                        type: row.kind === 'Player Character' ? 'PC' : 'NPC'
                    });
                }
                else if (row.kind === 'Item') {
                    await createItem(cfg, { campaign_id: this.selectedCampaignId, name: row.title, description: content });
                }
                else if (row.kind === 'Location') {
                    await createLocation(cfg, { campaign_id: this.selectedCampaignId, name: row.title, description: content });
                }
                else if (row.kind === 'Faction') {
                    await createFaction(cfg, { campaign_id: this.selectedCampaignId, name: row.title, description: content });
                }
                else if (row.kind === 'Lore') {
                    if (!row.loreSubtype)
                        throw new Error('Lore subtype is required');
                    const chunks = splitContentIntoChunks(row.title, content);
                    let idx = 0;
                    for (const ch of chunks) {
                        idx++;
                        await createLore(cfg, {
                            world_id: this.selectedCampaignId,
                            sub_type: row.loreSubtype,
                            content: ch.chunk,
                            file_name: ch.name + '.md',
                            original_name: row.title + (chunks.length > 1 ? ` - ${idx}` : '') + '.md',
                            file_type: 'text/markdown',
                            size: ch.chunk.length
                        });
                    }
                }
                row.status = 'done';
            }
            catch (e) {
                row.status = 'error';
                row.errorMessage = e.message || String(e);
                new obsidian.Notice(`Failed importing ${row.title}: ${row.errorMessage}`);
            }
            this.render();
        }
    }
}

class ArchivistImporterPlugin extends obsidian.Plugin {
    async onload() {
        await this.loadSettings();
        this.registerView(VIEW_TYPE_ARCHIVIST, (leaf) => new ImportView(leaf, this));
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
            if (!rightLeaf)
                return;
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

module.exports = ArchivistImporterPlugin;
//# sourceMappingURL=main.js.map
