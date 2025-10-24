const MAX_CHARS = 1_900_000; // below 2,000,000 server limit
const MAX_TOKENS = 30_000; // safety bound to avoid world cap spikes

export function estimateTokens(text: string): number {
    if (!text) return 0;
    // heuristic: ~4 chars per token
    return Math.ceil(text.length / 4);
}

export function splitContentIntoChunks(title: string, content: string): Array<{ name: string; chunk: string }> {
    if (!content) return [];

    // If content is small, return as single chunk
    if (content.length <= MAX_CHARS && estimateTokens(content) <= MAX_TOKENS) {
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
        if (currentChars + blockChars > MAX_CHARS || currentTokens + blockTokens > MAX_TOKENS) {
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
