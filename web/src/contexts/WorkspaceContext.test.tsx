import { act, renderHook } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ReactNode } from 'react';
import { WorkspaceProvider, useWorkspace } from './WorkspaceContext';
import { api } from '@/lib/api';

vi.mock('@/lib/api', () => ({
  api: {
    workspaces: {
      switch: vi.fn(),
      list: vi.fn(),
    },
  },
}));

const mockedSwitchWorkspace = vi.mocked(api.workspaces.switch);
const mockedListWorkspaces = vi.mocked(api.workspaces.list);

function wrapper({ children }: { children: ReactNode }) {
  return <WorkspaceProvider>{children}</WorkspaceProvider>;
}

describe('WorkspaceContext', () => {
  beforeEach(() => {
    mockedSwitchWorkspace.mockReset();
    mockedListWorkspaces.mockReset();
  });

  it('sets the current workspace from the switch response', async () => {
    mockedSwitchWorkspace.mockResolvedValue({
      success: true,
      data: {
        workspaceId: 'ws-2',
        workspace: {
          id: 'ws-2',
          name: 'Product Workspace',
          role: 'admin',
          archivedAt: null,
          createdAt: '2026-03-19T00:00:00.000Z',
          updatedAt: '2026-03-19T00:00:00.000Z',
        },
      },
    });

    const { result } = renderHook(() => useWorkspace(), { wrapper });

    await act(async () => {
      const success = await result.current.switchWorkspace('ws-2');
      expect(success).toBe(true);
    });

    expect(result.current.currentWorkspace).toMatchObject({
      id: 'ws-2',
      name: 'Product Workspace',
    });
  });

  it('refreshes workspaces from the nested API payload', async () => {
    mockedListWorkspaces.mockResolvedValue({
      success: true,
      data: {
        isSuperAdmin: false,
        workspaces: [
          {
            id: 'ws-1',
            name: 'Alpha Workspace',
            role: 'member',
            archivedAt: null,
            createdAt: '2026-03-19T00:00:00.000Z',
            updatedAt: '2026-03-19T00:00:00.000Z',
          },
        ],
      },
    });

    const { result } = renderHook(() => useWorkspace(), { wrapper });

    await act(async () => {
      await result.current.refreshWorkspaces();
    });

    expect(result.current.workspaces).toHaveLength(1);
    expect(result.current.workspaces[0]).toMatchObject({
      id: 'ws-1',
      name: 'Alpha Workspace',
      role: 'member',
    });
  });
});
