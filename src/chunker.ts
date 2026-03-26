export const MAX_COMPENDIUM_DESCRIPTION_CHARS = 10_000;
export const MAX_JOURNAL_CHARS = 1_900_000; // below 2,000,000 server limit
export const MAX_JOURNAL_TOKENS = 30_000; // conservative estimate to avoid API rejections
const MAX_SAFE_CHUNK_CHARS = Math.min(MAX_JOURNAL_CHARS, MAX_JOURNAL_TOKENS * 4);

export function estimateTokens(text: string): number {
    if (!text) return 0;
    // heuristic: ~4 chars per token
    return Math.ceil(text.length / 4);
}

export function isCompendiumDescriptionTooLarge(content: string): boolean {
    return content.length > MAX_COMPENDIUM_DESCRIPTION_CHARS;
}

export function validateJournalChunk(content: string): string | null {
    if (content.length > MAX_JOURNAL_CHARS) {
        return `journal content exceeds ${MAX_JOURNAL_CHARS.toLocaleString()} characters`;
    }
    if (estimateTokens(content) > MAX_JOURNAL_TOKENS) {
        return `journal content exceeds the estimated ${MAX_JOURNAL_TOKENS.toLocaleString()} token safety limit`;
    }
    return null;
}

function splitOversizedChunk(chunk: string): string[] {
    if (!chunk) return [];

    const pieces: string[] = [];
    let start = 0;

    while (start < chunk.length) {
        let end = Math.min(start + MAX_SAFE_CHUNK_CHARS, chunk.length);
        let slice = chunk.slice(start, end);
        let breakIndex = Math.max(slice.lastIndexOf('\n\n'), slice.lastIndexOf('\n'), slice.lastIndexOf(' '));

        if (end < chunk.length && breakIndex > 0) {
            end = start + breakIndex;
            slice = chunk.slice(start, end);
        }

        while (slice && validateJournalChunk(slice) !== null) {
            end -= Math.max(1000, Math.floor((end - start) / 8));
            if (end <= start) break;
            slice = chunk.slice(start, end);
        }

        if (!slice) {
            throw new Error('Unable to split journal content into safe chunk sizes.');
        }

        pieces.push(slice.trim());
        start = end;

        while (start < chunk.length && /\s/.test(chunk[start])) {
            start += 1;
        }
    }

    return pieces.filter(Boolean);
}

export function splitContentIntoChunks(title: string, content: string): Array<{ name: string; chunk: string }> {
    if (!content) return [];

    // If content is small, return as single chunk
    if (validateJournalChunk(content) === null) {
        return [{ name: title, chunk: content }];
    }

    // Prefer splitting by headings or paragraphs
    const blocks = content.split(/\n(?=#+\s|\s*$)/g); // split at markdown headings where possible
    const chunks: Array<{ name: string; chunk: string }> = [];

    let current: string[] = [];
    let currentChars = 0;
    let currentTokens = 0;

    function flush() {
        if (current.length === 0) return;
        const chunkText = current.join('\n');
        chunks.push({ name: `${title} - ${chunks.length + 1}`, chunk: chunkText });
        current = [];
        currentChars = 0;
        currentTokens = 0;
    }

    for (const block of blocks) {
        const blockChars = block.length + 1;
        const blockTokens = estimateTokens(block);
        if (currentChars + blockChars > MAX_SAFE_CHUNK_CHARS || currentTokens + blockTokens > MAX_JOURNAL_TOKENS) {
            flush();
        }
        current.push(block);
        currentChars += blockChars;
        currentTokens += blockTokens;
    }
    flush();

    // Fallback to hard split if any chunk still violates bounds
    const normalized: Array<{ name: string; chunk: string }> = [];
    for (const { name, chunk } of chunks) {
        if (validateJournalChunk(chunk) === null) {
            normalized.push({ name, chunk });
            continue;
        }
        for (const part of splitOversizedChunk(chunk)) {
            normalized.push({ name: `${name}`, chunk: part });
        }
    }

    // Rename sequentially 1..N
    return normalized.map((c, idx) => ({ name: `${title} - ${idx + 1}`, chunk: c.chunk }));
}
