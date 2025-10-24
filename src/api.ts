import type { Campaign } from './types';

export interface ApiConfig {
    apiKey: string;
}

const API_BASE_URL = 'https://api.myarchivist.ai';

async function apiFetch<T>(config: ApiConfig, path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${API_BASE_URL}${path}`, {
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
    if (res.status === 204) return undefined as unknown as T;
    return (await res.json()) as T;
}

export async function listCampaigns(config: ApiConfig): Promise<{ data: Campaign[]; total?: number }> { return apiFetch(config, `/v1/campaigns?page=1&size=100`); }

export async function createCampaign(config: ApiConfig, title: string) {
    return apiFetch<Campaign>(config, `/v1/campaigns`, {
        method: 'POST',
        body: JSON.stringify({ title })
    });
}

export async function createCharacter(config: ApiConfig, payload: {
    campaign_id: string;
    character_name: string;
    description?: string;
    type: 'PC' | 'NPC';
}) {
    return apiFetch(config, `/v1/characters`, {
        method: 'POST',
        body: JSON.stringify(payload)
    });
}

export async function createItem(config: ApiConfig, payload: {
    campaign_id: string;
    name: string;
    description?: string;
}) {
    return apiFetch(config, `/v1/items`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function createLocation(config: ApiConfig, payload: {
    campaign_id: string;
    name: string;
    description?: string;
}) {
    return apiFetch(config, `/v1/locations`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function createFaction(config: ApiConfig, payload: {
    campaign_id: string;
    name: string;
    description?: string;
}) {
    return apiFetch(config, `/v1/factions`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function createLore(config: ApiConfig, payload: {
    world_id: string;
    sub_type: string;
    content: string;
    file_name: string;
    original_name?: string;
    file_type?: string;
    size?: number;
}) {
    return apiFetch(config, `/v1/lore`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function createCampaignLink(config: ApiConfig, campaignId: string, payload: {
    from_id: string;
    from_type: 'Character' | 'Item' | 'Location' | 'Faction';
    to_id: string;
    to_type: 'Character' | 'Item' | 'Location' | 'Faction';
    alias: string;
}) {
    return apiFetch(config, `/v1/campaigns/${encodeURIComponent(campaignId)}/links`, {
        method: 'POST',
        body: JSON.stringify({ ...payload, campaign_id: campaignId })
    });
}
