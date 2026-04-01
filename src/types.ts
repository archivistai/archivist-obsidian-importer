export type DocumentKind = 'Player Character' | 'NPC' | 'Item' | 'Location' | 'Faction' | 'Journal Entry';

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
    kind: DocumentKind | null;
    selected: boolean;
    status?: 'queued' | 'uploading' | 'done' | 'error';
    errorMessage?: string;
}
