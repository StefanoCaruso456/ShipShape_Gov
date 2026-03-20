import type { Request } from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequestScopedShipApiClient } from './fleetgraph-runner.js';

describe('createRequestScopedShipApiClient', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('forwards the session cookie and csrf header for state-changing internal Ship requests', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'comment-1' }),
    });

    const client = createRequestScopedShipApiClient({
      headers: {
        cookie: 'connect.sid=session-cookie',
        'x-csrf-token': 'csrf-token-1',
      },
    } as unknown as Request);

    await client.post('/api/documents/week-1/comments', {
      comment_id: 'comment-1',
      content: 'Approved follow-up',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:3000/api/documents/week-1/comments',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Accept: 'application/json',
          'Content-Type': 'application/json',
          cookie: 'connect.sid=session-cookie',
          'x-csrf-token': 'csrf-token-1',
        }),
      })
    );
  });
});
