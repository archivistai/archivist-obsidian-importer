import { describe, it, expect } from 'vitest';
import { prefilterMarkdown, sanitizeMarkdown } from '../src/markdownCleaner';

describe('prefilterMarkdown', () => {
    it('removes dataview blocks', () => {
        const input = 'before\n```dataview\nLIST FROM #tag\n```\nafter';
        expect(prefilterMarkdown(input)).not.toContain('dataview');
        expect(prefilterMarkdown(input)).toContain('before');
        expect(prefilterMarkdown(input)).toContain('after');
    });

    it('removes dataviewjs blocks', () => {
        const input = '```dataviewjs\nconsole.log("hi")\n```';
        expect(prefilterMarkdown(input)).not.toContain('dataviewjs');
    });

    it('removes Obsidian comments', () => {
        const input = 'keep this %% remove this %% and this';
        expect(prefilterMarkdown(input)).not.toContain('remove this');
        expect(prefilterMarkdown(input)).toContain('keep this');
    });

    it('removes inline fields (key:: value)', () => {
        const input = 'Title: foo\nstatus:: draft\nbody text';
        const result = prefilterMarkdown(input);
        expect(result).not.toContain('status::');
        expect(result).toContain('body text');
    });

    it('removes embedded images ![[file.png]]', () => {
        const input = 'text ![[map.png]] more text';
        expect(prefilterMarkdown(input)).not.toContain('![[');
    });

    it('removes standard markdown images', () => {
        const input = 'before ![alt](image.png) after';
        expect(prefilterMarkdown(input)).not.toContain('![alt]');
        expect(prefilterMarkdown(input)).toContain('before');
        expect(prefilterMarkdown(input)).toContain('after');
    });

    it('strips callout markers but preserves content', () => {
        const input = '> [!NOTE] My note\n> content here';
        const result = prefilterMarkdown(input);
        expect(result).not.toContain('[!NOTE]');
        expect(result).toContain('content here');
    });

    it('leaves regular content intact', () => {
        const input = '# Heading\n\nA paragraph with **bold** and [[wikilink]].\n\n- item one\n- item two';
        const result = prefilterMarkdown(input);
        expect(result).toContain('# Heading');
        expect(result).toContain('**bold**');
        expect(result).toContain('[[wikilink]]');
        expect(result).toContain('item one');
    });
});

describe('sanitizeMarkdown — fast path for large notes', () => {
    it('uses prefilter only for notes over 200k chars', async () => {
        const largeNote = 'a'.repeat(200_001) + '\n```dataview\nLIST\n```';
        const result = await sanitizeMarkdown(largeNote);
        // dataview block should be removed by prefilter
        expect(result).not.toContain('dataview');
        // content preserved
        expect(result).toContain('a'.repeat(100));
    });

    it('runs full AST cleanup for small notes', async () => {
        const smallNote = '```dataview\nLIST FROM #tag\n```\n\nsome content';
        const result = await sanitizeMarkdown(smallNote);
        expect(result).not.toContain('dataview');
        expect(result).toContain('some content');
    });

    it('handles empty string', async () => {
        expect(await sanitizeMarkdown('')).toBe('');
    });
});

describe('sanitizeMarkdown — Obsidian-specific cleanup', () => {
    it('removes Obsidian comments', async () => {
        const input = 'visible %% hidden comment %% still visible';
        const result = await sanitizeMarkdown(input);
        expect(result).not.toContain('hidden comment');
        expect(result).toContain('visible');
        expect(result).toContain('still visible');
    });

    it('unwraps callout blockquotes', async () => {
        const input = '> [!TIP] Useful tip\n> This is the callout body.';
        const result = await sanitizeMarkdown(input);
        expect(result).not.toContain('[!TIP]');
        expect(result).toContain('This is the callout body');
    });

    it('removes images', async () => {
        const input = '![diagram](diagram.png)\n\nfollowing paragraph';
        const result = await sanitizeMarkdown(input);
        expect(result).not.toContain('diagram.png');
        expect(result).toContain('following paragraph');
    });

    it('removes inline field paragraphs', async () => {
        const input = 'aliases:: hero, ranger\n\nNormal paragraph.';
        const result = await sanitizeMarkdown(input);
        expect(result).not.toContain('aliases::');
        expect(result).toContain('Normal paragraph');
    });
});
