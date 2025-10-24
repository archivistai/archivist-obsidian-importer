export type DocumentKind = 'Player Character' | 'NPC' | 'Item' | 'Location' | 'Faction' | 'Lore';

export interface Campaign {
    id: string;
    title: string;
    description?: string;
    system?: string;
    public?: boolean;
    created_at?: string;
}

export interface ImportRowState {
    filePath: string;
    title: string;
    size: number;
    kind: DocumentKind;
    loreSubtype?: string;
    selected: boolean;
    status?: 'queued' | 'uploading' | 'done' | 'error';
    errorMessage?: string;
}

export interface ArchivistSettings {
    apiKey: string;
    baseUrl: string;
}
