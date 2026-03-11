import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DocumentsPage } from './Documents';
import type { WikiDocument } from '@/contexts/DocumentsContext';

const mocks = vi.hoisted(() => ({
  showToast: vi.fn(),
  deleteSpy: vi.fn(),
  seedDocuments: [] as WikiDocument[],
}));

vi.mock('@/contexts/DocumentsContext', async () => {
  const ReactModule = await import('react');
  return {
    useDocuments: () => {
      const [documents, setDocuments] = ReactModule.useState([...mocks.seedDocuments]);

      return {
        documents,
        loading: false,
        createDocument: vi.fn(),
        updateDocument: vi.fn(),
        refreshDocuments: vi.fn(),
        deleteDocument: vi.fn(async (id: string) => {
          mocks.deleteSpy(id);
          setDocuments((current) => current.filter((document) => document.id !== id));
          return true;
        }),
      };
    },
  };
});

vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({
    showToast: mocks.showToast,
  }),
}));

vi.mock('@/components/ui/Tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({}),
}));

vi.mock('@/hooks/useColumnVisibility', () => ({
  useColumnVisibility: () => ({
    visibleColumns: ['title'],
    columns: [],
    hiddenCount: 0,
    toggleColumn: vi.fn(),
  }),
}));

vi.mock('@/hooks/useListFilters', () => ({
  useListFilters: () => ({
    sortBy: 'title',
    setSortBy: vi.fn(),
    viewMode: 'tree',
    setViewMode: vi.fn(),
  }),
}));

describe('DocumentsPage', () => {
  beforeEach(() => {
    mocks.showToast.mockReset();
    mocks.deleteSpy.mockReset();
    mocks.seedDocuments = [{
      id: 'doc-delete-1',
      title: 'Delete Me',
      document_type: 'wiki',
      parent_id: null,
      position: 0,
      created_at: '2026-03-11T00:00:00.000Z',
      updated_at: '2026-03-11T00:00:00.000Z',
      visibility: 'workspace',
    }];
  });

  it('deletes a document from the docs tree and surfaces feedback', async () => {
    // critical-path: document-delete-ui
    // Risk mitigated: if the docs-tree delete button stops wiring through to the delete mutation, users can think a document was removed while the UI silently keeps stale data.
    render(
      <MemoryRouter initialEntries={['/docs']}>
        <DocumentsPage />
      </MemoryRouter>
    );

    expect(screen.getByText('Delete Me')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Delete document'));

    await waitFor(() => {
      expect(mocks.deleteSpy).toHaveBeenCalledWith('doc-delete-1');
    });
    expect(mocks.showToast).toHaveBeenCalledWith('"Delete Me" deleted', 'info');
    await waitFor(() => {
      expect(screen.queryByText('Delete Me')).not.toBeInTheDocument();
    });
  });
});
