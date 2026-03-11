import { describe, it, expect, beforeEach, vi } from 'vitest';
import { queryResponse } from '../test/query-result.js';

const { queryMock } = vi.hoisted(() => ({
  queryMock: vi.fn(async (_queryText: string, _values?: unknown[]) => queryResponse({ rows: [] })),
}));

// Mock pool before importing the module
vi.mock('../db/client.js', () => ({
  pool: {
    query: queryMock,
  },
}));

import { transformIssueLinks } from '../utils/transformIssueLinks.js';

interface TipTapMark {
  type: string;
  attrs?: Record<string, unknown>;
}

interface TipTapNode {
  type: string;
  text?: string;
  marks?: TipTapMark[];
  content?: TipTapNode[];
}

interface TipTapDoc {
  type: 'doc';
  content: TipTapNode[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isTipTapMark(value: unknown): value is TipTapMark {
  return isRecord(value) && typeof value.type === 'string';
}

function isTipTapNode(value: unknown): value is TipTapNode {
  if (!isRecord(value) || typeof value.type !== 'string') {
    return false;
  }

  if (value.text !== undefined && typeof value.text !== 'string') {
    return false;
  }

  if (value.marks !== undefined && (!Array.isArray(value.marks) || !value.marks.every(isTipTapMark))) {
    return false;
  }

  if (value.content !== undefined && (!Array.isArray(value.content) || !value.content.every(isTipTapNode))) {
    return false;
  }

  return true;
}

function getTipTapDoc(value: unknown): TipTapDoc {
  if (!isRecord(value) || value.type !== 'doc' || !Array.isArray(value.content) || !value.content.every(isTipTapNode)) {
    throw new Error('Expected TipTap document');
  }

  return {
    type: 'doc',
    content: value.content,
  };
}

function getNodeContent(node: TipTapNode | undefined, label: string): TipTapNode[] {
  if (!node?.content) {
    throw new Error(`Missing content for ${label}`);
  }

  return node.content;
}

describe('transformIssueLinks', () => {
  const workspaceId = 'test-workspace-id';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('pattern matching and transformation', () => {
    it('transforms #123 pattern to clickable link', async () => {
      const content = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'See #42 for details' }],
          },
        ],
      };

      // Mock issue lookup
      queryMock.mockResolvedValueOnce(queryResponse({
        rows: [{ id: 'issue-uuid-42', ticket_number: 42 }],
      }));

      const result = getTipTapDoc(await transformIssueLinks(content, workspaceId));
      const paragraphNodes = getNodeContent(result.content[0], 'first paragraph');

      expect(paragraphNodes).toHaveLength(3);
      expect(paragraphNodes[0]).toEqual({ type: 'text', text: 'See ' });
      expect(paragraphNodes[1]).toEqual({
        type: 'text',
        text: '#42',
        marks: [
          {
            type: 'link',
            attrs: {
              href: '/issues/issue-uuid-42',
              target: '_self',
            },
          },
        ],
      });
      expect(paragraphNodes[2]).toEqual({ type: 'text', text: ' for details' });
    });

    it('transforms "issue #123" pattern to clickable link', async () => {
      const content = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Fixed in issue #100' }],
          },
        ],
      };

      queryMock.mockResolvedValueOnce(queryResponse({
        rows: [{ id: 'issue-uuid-100', ticket_number: 100 }],
      }));

      const result = getTipTapDoc(await transformIssueLinks(content, workspaceId));
      const paragraphNodes = getNodeContent(result.content[0], 'first paragraph');

      expect(paragraphNodes[1]).toEqual({
        type: 'text',
        text: 'issue #100',
        marks: [
          {
            type: 'link',
            attrs: {
              href: '/issues/issue-uuid-100',
              target: '_self',
            },
          },
        ],
      });
    });

    it('transforms "ISS-123" pattern to clickable link', async () => {
      const content = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Related to ISS-500' }],
          },
        ],
      };

      queryMock.mockResolvedValueOnce(queryResponse({
        rows: [{ id: 'issue-uuid-500', ticket_number: 500 }],
      }));

      const result = getTipTapDoc(await transformIssueLinks(content, workspaceId));
      const paragraphNodes = getNodeContent(result.content[0], 'first paragraph');

      expect(paragraphNodes[1]).toEqual({
        type: 'text',
        text: 'ISS-500',
        marks: [
          {
            type: 'link',
            attrs: {
              href: '/issues/issue-uuid-500',
              target: '_self',
            },
          },
        ],
      });
    });

    it('transforms multiple issue references in same text', async () => {
      const content = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'See #10, #20, and issue #30' }],
          },
        ],
      };

      queryMock.mockResolvedValueOnce(queryResponse({
        rows: [
          { id: 'issue-uuid-10', ticket_number: 10 },
          { id: 'issue-uuid-20', ticket_number: 20 },
          { id: 'issue-uuid-30', ticket_number: 30 },
        ],
      }));

      const result = getTipTapDoc(await transformIssueLinks(content, workspaceId));

      // Should split into multiple text nodes with links
      const nodes = getNodeContent(result.content[0], 'first paragraph');
      expect(nodes.some((node) => node.text === '#10' && node.marks)).toBe(true);
      expect(nodes.some((node) => node.text === '#20' && node.marks)).toBe(true);
      expect(nodes.some((node) => node.text === 'issue #30' && node.marks)).toBe(true);
    });

    it('queries database for all unique ticket numbers', async () => {
      const content = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: '#1 and #2 and #3' }],
          },
        ],
      };

      queryMock.mockResolvedValueOnce(queryResponse({
        rows: [],
      }));

      await transformIssueLinks(content, workspaceId);

      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining('ticket_number = ANY'),
        [workspaceId, expect.arrayContaining([1, 2, 3])]
      );
    });

    it('deduplicates ticket numbers in query', async () => {
      const content = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: '#5 and #5 and #5' }],
          },
        ],
      };

      queryMock.mockResolvedValueOnce(queryResponse({
        rows: [],
      }));

      await transformIssueLinks(content, workspaceId);

      const queryArgs = queryMock.mock.calls[0]?.[1];
      const ticketNumbers = Array.isArray(queryArgs) ? queryArgs[1] : undefined;

      // Should only query for #5 once despite appearing multiple times
      expect(ticketNumbers).toEqual([5]);
    });
  });

  describe('edge cases', () => {
    it('does not transform text that already has marks', async () => {
      const content = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: '#99 is already a link',
                marks: [{ type: 'link', attrs: { href: '/somewhere' } }],
              },
            ],
          },
        ],
      };

      // Mock database lookup (implementation still queries even for marked text)
      queryMock.mockResolvedValueOnce(queryResponse({
        rows: [{ id: 'issue-uuid-99', ticket_number: 99 }],
      }));

      const result = getTipTapDoc(await transformIssueLinks(content, workspaceId));
      const paragraphNodes = getNodeContent(result.content[0], 'first paragraph');

      // Should not transform already marked text
      expect(paragraphNodes[0]).toEqual({
        type: 'text',
        text: '#99 is already a link',
        marks: [{ type: 'link', attrs: { href: '/somewhere' } }],
      });

      // Note: Implementation does query database for ticket numbers,
      // but doesn't transform text that already has marks
      expect(queryMock).toHaveBeenCalled();
    });

    it('keeps issue reference as plain text when issue does not exist', async () => {
      const content = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Non-existent #999' }],
          },
        ],
      };

      // No matching issues found
      queryMock.mockResolvedValueOnce(queryResponse({
        rows: [],
      }));

      const result = getTipTapDoc(await transformIssueLinks(content, workspaceId));
      const paragraphNodes = getNodeContent(result.content[0], 'first paragraph');

      // When no issues are found, content is returned unchanged
      // (implementation optimization - doesn't transform if issueMap is empty)
      expect(result).toEqual(content);
      expect(paragraphNodes[0]?.text).toBe('Non-existent #999');
      expect(paragraphNodes[0]?.marks).toBeUndefined();
    });

    it('transforms existing issues but not non-existent ones', async () => {
      const content = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'See #50 and #999' }],
          },
        ],
      };

      // Only #50 exists
      queryMock.mockResolvedValueOnce(queryResponse({
        rows: [{ id: 'issue-uuid-50', ticket_number: 50 }],
      }));

      const result = getTipTapDoc(await transformIssueLinks(content, workspaceId));
      const nodes = getNodeContent(result.content[0], 'first paragraph');

      // #50 should have link mark
      const link50 = nodes.find((node) => node.text === '#50');
      expect(link50?.marks).toBeDefined();

      // #999 should be plain text (no marks)
      const text999 = nodes.find((node) => node.text === '#999');
      expect(text999?.marks).toBeUndefined();
    });

    it('returns unchanged content when no issue patterns found', async () => {
      const content = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'No issue references here' }],
          },
        ],
      };

      const result = await transformIssueLinks(content, workspaceId);

      // Should not query database
      expect(queryMock).not.toHaveBeenCalled();

      // Should return unchanged
      expect(result).toEqual(content);
    });

    it('returns unchanged content for invalid input', async () => {
      expect(await transformIssueLinks(null, workspaceId)).toBeNull();
      expect(await transformIssueLinks(undefined, workspaceId)).toBeUndefined();
      expect(await transformIssueLinks('string', workspaceId)).toBe('string');
      expect(await transformIssueLinks(123, workspaceId)).toBe(123);
    });

    it('returns unchanged content when not a doc type', async () => {
      const content = {
        type: 'paragraph',
        content: [{ type: 'text', text: '#123' }],
      };

      const result = await transformIssueLinks(content, workspaceId);
      expect(result).toEqual(content);
      expect(queryMock).not.toHaveBeenCalled();
    });

    it('handles empty document content', async () => {
      const content = {
        type: 'doc',
        content: [],
      };

      const result = await transformIssueLinks(content, workspaceId);
      expect(result).toEqual(content);
      expect(queryMock).not.toHaveBeenCalled();
    });
  });

  describe('nested content structures', () => {
    it('transforms issue links in nested paragraphs', async () => {
      const content = {
        type: 'doc',
        content: [
          {
            type: 'bulletList',
            content: [
              {
                type: 'listItem',
                content: [
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'Item with #25' }],
                  },
                ],
              },
            ],
          },
        ],
      };

      queryMock.mockResolvedValueOnce(queryResponse({
        rows: [{ id: 'issue-uuid-25', ticket_number: 25 }],
      }));

      const result = getTipTapDoc(await transformIssueLinks(content, workspaceId));
      const bulletListNodes = getNodeContent(result.content[0], 'bullet list');
      const listItemNodes = getNodeContent(bulletListNodes[0], 'list item');
      const paragraph = listItemNodes[0];
      const paragraphNodes = getNodeContent(paragraph, 'nested paragraph');
      const link = paragraphNodes.find((node) => node.text === '#25');
      expect(link?.marks).toBeDefined();
      expect(link?.marks?.[0]?.attrs?.href).toBe('/issues/issue-uuid-25');
    });

    it('transforms issue links in blockquotes', async () => {
      const content = {
        type: 'doc',
        content: [
          {
            type: 'blockquote',
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: 'Quoted text with issue #77' }],
              },
            ],
          },
        ],
      };

      queryMock.mockResolvedValueOnce(queryResponse({
        rows: [{ id: 'issue-uuid-77', ticket_number: 77 }],
      }));

      const result = getTipTapDoc(await transformIssueLinks(content, workspaceId));
      const blockquoteNodes = getNodeContent(result.content[0], 'blockquote');
      const paragraph = blockquoteNodes[0];
      const paragraphNodes = getNodeContent(paragraph, 'blockquote paragraph');
      const link = paragraphNodes.find((node) => node.text === 'issue #77');
      expect(link?.marks).toBeDefined();
    });

    it('recursively transforms all nested issue references', async () => {
      const content = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Top level #1' }],
          },
          {
            type: 'bulletList',
            content: [
              {
                type: 'listItem',
                content: [
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'Nested #2' }],
                  },
                ],
              },
            ],
          },
        ],
      };

      queryMock.mockResolvedValueOnce(queryResponse({
        rows: [
          { id: 'issue-uuid-1', ticket_number: 1 },
          { id: 'issue-uuid-2', ticket_number: 2 },
        ],
      }));

      await transformIssueLinks(content, workspaceId);

      // Should find both #1 and #2
      expect(queryMock).toHaveBeenCalledWith(
        expect.anything(),
        [workspaceId, expect.arrayContaining([1, 2])]
      );
    });
  });

  describe('workspace isolation', () => {
    it('only looks up issues in the specified workspace', async () => {
      const content = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: '#123' }],
          },
        ],
      };

      queryMock.mockResolvedValueOnce(queryResponse({
        rows: [],
      }));

      await transformIssueLinks(content, workspaceId);

      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining('workspace_id = $1'),
        [workspaceId, [123]]
      );
    });

    it('does not transform issues from other workspaces', async () => {
      const content = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: '#888' }],
          },
        ],
      };

      // Issue exists but in different workspace
      queryMock.mockResolvedValueOnce(queryResponse({
        rows: [],
      }));

      const result = getTipTapDoc(await transformIssueLinks(content, workspaceId));

      // Should remain plain text
      const textNode = getNodeContent(result.content[0], 'first paragraph')[0];
      expect(textNode?.marks).toBeUndefined();
    });
  });

  describe('case variations', () => {
    it('handles "issue #" with various casings', async () => {
      const content = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Issue #5 and ISSUE #6' }],
          },
        ],
      };

      queryMock.mockResolvedValueOnce(queryResponse({
        rows: [
          { id: 'issue-uuid-5', ticket_number: 5 },
          { id: 'issue-uuid-6', ticket_number: 6 },
        ],
      }));

      const result = getTipTapDoc(await transformIssueLinks(content, workspaceId));
      const nodes = getNodeContent(result.content[0], 'first paragraph');

      // Both should be transformed
      expect(nodes.some((node) => node.text === 'Issue #5' && node.marks)).toBe(true);
      expect(nodes.some((node) => node.text === 'ISSUE #6' && node.marks)).toBe(true);
    });
  });

  describe('performance considerations', () => {
    it('does not query database when no patterns detected', async () => {
      const content = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Just normal text without issue refs' }],
          },
        ],
      };

      const result = await transformIssueLinks(content, workspaceId);

      // Should not query when no issue patterns found
      expect(queryMock).not.toHaveBeenCalled();

      // Should return unchanged content
      expect(result).toEqual(content);
    });

    it('makes single batch query for multiple issues', async () => {
      const content = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: '#1 #2 #3 #4 #5' }],
          },
        ],
      };

      queryMock.mockResolvedValueOnce(queryResponse({
        rows: [],
      }));

      await transformIssueLinks(content, workspaceId);

      // Should make exactly one query for all issues
      expect(queryMock).toHaveBeenCalledTimes(1);
    });
  });
});
