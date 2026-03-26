import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkStringify from 'remark-stringify';
import remarkGfm from 'remark-gfm';
import remarkFrontmatter from 'remark-frontmatter';
import { visit, SKIP } from 'unist-util-visit';

type UnknownRecord = Record<string, unknown>;
type AnyNode = { type: string } & UnknownRecord;
type ParentNode = AnyNode & { children: AnyNode[] };
type TextNode = AnyNode & { type: 'text'; value: string };

function isParentNode(node: AnyNode): node is ParentNode {
    return Array.isArray((node as UnknownRecord).children);
}

function isTextNode(node: AnyNode): node is TextNode {
    return node.type === 'text' && typeof (node as UnknownRecord).value === 'string';
}

function remarkCleanObsidian() {
    return (tree: unknown) => {
        visit(tree as AnyNode, (node: AnyNode, index: number | undefined, parent: AnyNode | undefined) => {
            if (!parent || index == null || !isParentNode(parent)) return;

            // Remove dataview/dataviewjs code blocks
            if (node.type === 'code' && typeof node.lang === 'string' && /^(dataview|dataviewjs)$/i.test(node.lang)) {
                parent.children.splice(index, 1);
                return [SKIP, index];
            }

            // Remove images entirely
            if (node.type === 'image') {
                parent.children.splice(index, 1);
                return [SKIP, index];
            }

            // Unwrap callouts: blockquotes that start with [!TYPE]
            if (node.type === 'blockquote') {
                const children = isParentNode(node) ? node.children : undefined;
                const first = children?.[0];
                const firstText = first?.type === 'paragraph' && isParentNode(first)
                    ? first.children.map((c) => (isTextNode(c) ? c.value : '')).join('')
                    : '';
                if (/^\s*\[![A-Za-z].*?\]/.test(firstText || '')) {
                    if (first?.type === 'paragraph' && isParentNode(first)) {
                        first.children = first.children.filter((c) => !(isTextNode(c) && /^\s*\[![A-Za-z].*?\]\s*/.test(c.value)));
                        if (first.children.length && isTextNode(first.children[0])) {
                            first.children[0].value = first.children[0].value.replace(/^\s*\[![A-Za-z].*?\]\s*/, '');
                        }
                    }
                    if (isParentNode(node)) parent.children.splice(index, 1, ...node.children);
                    return [SKIP, index];
                }
            }

            // Drop inline-field paragraphs like "key:: value"
            if (node.type === 'paragraph') {
                const txt = (isParentNode(node) ? node.children : [])
                    .map((c) => (isTextNode(c) ? c.value : ''))
                    .join('')
                    .trim();
                if (/^[A-Za-z0-9_\-\s]+::/.test(txt)) {
                    parent.children.splice(index, 1);
                    return [SKIP, index];
                }
            }

            // Normalize task list items: keep text, unset "checked"
            if (node.type === 'listItem' && typeof node.checked === 'boolean') {
                delete node.checked;
            }

            // Remove Obsidian comments %% ... %% (as paragraphs)
            if (node.type === 'paragraph') {
                const raw = (isParentNode(node) ? node.children : [])
                    .map((c) => (isTextNode(c) ? c.value : ''))
                    .join('');
                if (/%%[\s\S]*%%/.test(raw)) {
                    const cleaned = raw.replace(/%%[\s\S]*?%%/g, '').trim();
                    if (!cleaned) {
                        parent.children.splice(index, 1);
                        return [SKIP, index];
                    } else {
                        if (isParentNode(node)) node.children = [{ type: 'text', value: cleaned }];
                    }
                }
            }
        });
    };
}

// Lightweight pre-filter to remove obvious constructs before parsing
export function prefilterMarkdown(md: string): string {
    return md
        .replace(/```(?:dataview|dataviewjs)[\s\S]*?```/gi, '')
        .replace(/%%[\s\S]*?%%/g, '')
        .replace(/^[ \t]*[A-Za-z0-9_\-\s]+::.*$/gm, '')
        .replace(/!\[\[[^\]]+\]\]/g, '')
        .replace(/^>\s*\[![^\]]+\]\s*/gm, '> ')
        .replace(/!\[[^\]]*\]\([^)]\)/g, '');
}

export async function cleanObsidianMarkdown(md: string): Promise<string> {
    const file = await unified()
        .use(remarkParse)
        .use(remarkFrontmatter, ['yaml'])
        .use(remarkGfm)
        .use(remarkCleanObsidian)
        .use(remarkStringify, {
            bullet: '-',
            fences: true,
            listItemIndent: 'one'
        })
        .process(md);
    return String(file);
}

export async function sanitizeMarkdown(md: string): Promise<string> {
    const pre = prefilterMarkdown(md);
    return await cleanObsidianMarkdown(pre);
}
