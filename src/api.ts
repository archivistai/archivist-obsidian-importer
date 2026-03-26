import type { Campaign } from './types';
import { requestUrl, type RequestUrlParam, type RequestUrlResponse } from 'obsidian';

export interface ApiConfig {
    apiKey: string;
}

const API_BASE_URL = 'https://api.myarchivist.ai';
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);
const MAX_RETRY_ATTEMPTS = 3;
const MAX_RETRY_DELAY_MS = 10_000;

type ApiRequestInit = Omit<RequestUrlParam, 'url' | 'headers'> & {
    headers?: Record<string, string>;
};

function getResponseBody(res: RequestUrlResponse): unknown {
    // `requestUrl` may populate `json` (object) and/or `text` (string).
    if (res.json !== undefined) return res.json as unknown;
    if (typeof res.text === 'string' && res.text.length > 0) {
        try {
            return JSON.parse(res.text) as unknown;
        } catch {
            return res.text;
        }
    }
    return undefined;
}

function getHeaderValue(res: RequestUrlResponse, name: string): string | null {
    const headers = res.headers as Record<string, string> | undefined;
    if (!headers) return null;

    for (const [key, value] of Object.entries(headers)) {
        if (key.toLowerCase() === name.toLowerCase()) {
            return value;
        }
    }

    return null;
}

function getRetryDelayMs(res: RequestUrlResponse, attempt: number): number {
    const retryAfter = getHeaderValue(res, 'Retry-After');
    if (retryAfter) {
        const seconds = Number.parseInt(retryAfter, 10);
        if (Number.isFinite(seconds) && seconds >= 0) {
            return Math.min(seconds * 1000, MAX_RETRY_DELAY_MS);
        }

        const retryAt = Date.parse(retryAfter);
        if (!Number.isNaN(retryAt)) {
            return Math.min(Math.max(0, retryAt - Date.now()), MAX_RETRY_DELAY_MS);
        }
    }

    return Math.min(1000 * (2 ** attempt), MAX_RETRY_DELAY_MS);
}

async function sleep(ms: number): Promise<void> {
    await new Promise((resolve) => globalThis.setTimeout(resolve, ms));
}

async function apiRequest<T>(config: ApiConfig, path: string, init: ApiRequestInit = {}): Promise<T> {
    const url = `${API_BASE_URL}${path}`;
    for (let attempt = 0; ; attempt += 1) {
        const res = await requestUrl({
            url,
            method: init.method ?? 'GET',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': config.apiKey,
                ...(init.headers ?? {})
            },
            body: init.body,
            contentType: init.contentType,
            throw: false
        });

        if (res.status >= 200 && res.status < 300) {
            const body = getResponseBody(res);
            return body as T;
        }

        if (attempt < MAX_RETRY_ATTEMPTS && RETRYABLE_STATUS_CODES.has(res.status)) {
            await sleep(getRetryDelayMs(res, attempt));
            continue;
        }

        const body = getResponseBody(res);
        const suffix = typeof body === 'string' ? body : JSON.stringify(body ?? '');
        throw new Error(`${res.status} - ${suffix}`);
    }
}

export async function listCampaigns(config: ApiConfig): Promise<{ data: Campaign[]; total?: number }> {
    return apiRequest(config, `/v1/campaigns?page=1&size=100`);
}

export async function createCampaign(config: ApiConfig, title: string) {
    return apiRequest<Campaign>(config, `/v1/campaigns`, {
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
    return apiRequest<{ id: string }>(config, `/v1/characters`, {
        method: 'POST',
        body: JSON.stringify(payload)
    });
}

export async function createItem(config: ApiConfig, payload: {
    campaign_id: string;
    name: string;
    description?: string;
}) {
    return apiRequest<{ id: string }>(config, `/v1/items`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function createLocation(config: ApiConfig, payload: {
    campaign_id: string;
    name: string;
    description?: string;
}) {
    return apiRequest<{ id: string }>(config, `/v1/locations`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function createFaction(config: ApiConfig, payload: {
    campaign_id: string;
    name: string;
    description?: string;
}) {
    return apiRequest<{ id: string }>(config, `/v1/factions`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function createJournalEntry(config: ApiConfig, payload: {
    world_id: string;
    title: string;
    content?: string;
    summary?: string;
    tags?: string[];
    cover_image?: string;
    is_pinned?: boolean;
    is_public?: boolean;
    status?: 'draft' | 'published' | 'archived';
    published_at?: string;
    archived_at?: string;
    folder_id?: string;
}) {
    return apiRequest<{ id?: string }>(config, `/v1/journals`, { method: 'POST', body: JSON.stringify(payload) });
}
