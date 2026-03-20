import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../db/client.js', () => ({
  pool: {
    query: vi.fn(),
  },
}));

vi.mock('../middleware/visibility.js', () => ({
  getVisibilityContext: vi.fn().mockResolvedValue({ isAdmin: false }),
  VISIBILITY_FILTER_SQL: vi.fn().mockReturnValue('1=1'),
}));

vi.mock('../middleware/auth.js', () => ({
  authMiddleware: vi.fn((req, _res, next) => {
    req.userId = 'user-123';
    req.workspaceId = 'ws-123';
    req.workspaceRole = 'admin';
    next();
  }),
  getAuthContext: vi.fn((req) => ({
    userId: req.userId,
    workspaceId: req.workspaceId,
    sessionId: req.sessionId,
    isSuperAdmin: req.isSuperAdmin === true,
    isApiToken: req.isApiToken === true,
  })),
}));

import express from 'express';
import request from 'supertest';
import { pool } from '../db/client.js';
import issuesRouter from './issues.js';

describe('Issues dependency signals API', () => {
  let app: express.Express;

  beforeEach(() => {
    vi.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use('/api/issues', issuesRouter);
  });

  it('returns aggregated blocker signals for accessible issues', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({
        rows: [{ id: '11111111-1111-1111-1111-111111111111' }, { id: '22222222-2222-2222-2222-222222222222' }],
      } as never)
      .mockResolvedValueOnce({
        rows: [
          {
            issue_id: '11111111-1111-1111-1111-111111111111',
            status: 'in_progress',
            blockers_encountered: 'Waiting on API review from platform team',
            created_at: '2026-03-17T12:00:00.000Z',
            author_name: 'stefano caruso',
          },
          {
            issue_id: '22222222-2222-2222-2222-222222222222',
            status: 'pass',
            blockers_encountered: null,
            created_at: '2026-03-20T09:00:00.000Z',
            author_name: 'stefano caruso',
          },
        ],
      } as never);

    const response = await request(app).get(
      '/api/issues/dependency-signals?issue_ids=11111111-1111-1111-1111-111111111111,22222222-2222-2222-2222-222222222222'
    );

    expect(response.status).toBe(200);
    expect(response.body.summary.requestedIssueCount).toBe(2);
    expect(response.body.summary.accessibleIssueCount).toBe(2);
    expect(response.body.summary.unresolvedBlockerCount).toBe(1);
    expect(response.body.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          issueId: '11111111-1111-1111-1111-111111111111',
          hasUnresolvedBlocker: true,
          blockerSummary: 'Waiting on API review from platform team',
          blockerLoggedBy: 'stefano caruso',
        }),
      ])
    );
  });

  it('returns 400 for an invalid issue_ids query', async () => {
    const response = await request(app).get('/api/issues/dependency-signals?issue_ids=not-a-uuid');

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Invalid dependency signal query');
  });
});
