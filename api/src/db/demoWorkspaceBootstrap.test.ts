import { describe, expect, it } from 'vitest';
import {
  DEMO_WORKSPACE_OWNER_SELECTION_SQL,
  shouldBackfillDemoWorkspace,
} from './demoWorkspaceBootstrap.js';

describe('shouldBackfillDemoWorkspace', () => {
  it('accepts setup-created personal workspaces even with more than one member', () => {
    expect(
      shouldBackfillDemoWorkspace({
        workspace_name: "stefano caruso's Workspace",
        owner_user_id: 'user-123',
        program_count: '0',
        project_count: '0',
        welcome_doc_count: '1',
      })
    ).toBe(true);
  });

  it('rejects non-setup workspaces', () => {
    expect(
      shouldBackfillDemoWorkspace({
        workspace_name: 'Ship Workspace',
        owner_user_id: 'user-123',
        program_count: '0',
        project_count: '0',
        welcome_doc_count: '1',
      })
    ).toBe(false);
  });

  it('rejects workspaces that already have demo data', () => {
    expect(
      shouldBackfillDemoWorkspace({
        workspace_name: "stefano caruso's Workspace",
        owner_user_id: 'user-123',
        program_count: '5',
        project_count: '0',
        welcome_doc_count: '1',
      })
    ).toBe(false);
  });

  it('avoids MAX on UUID workspace member ids in the backfill query', () => {
    expect(DEMO_WORKSPACE_OWNER_SELECTION_SQL).toContain('array_agg');
    expect(DEMO_WORKSPACE_OWNER_SELECTION_SQL).not.toContain('MAX(');
  });
});
