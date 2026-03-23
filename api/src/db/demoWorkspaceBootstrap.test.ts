import { describe, expect, it } from 'vitest';
import {
  DEMO_WORKSPACE_OWNER_SELECTION_SQL,
  shouldBackfillMissingIssueTypesForWorkspace,
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
        issue_count: '0',
        sprint_count: '0',
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
        issue_count: '0',
        sprint_count: '0',
        welcome_doc_count: '1',
      })
    ).toBe(false);
  });

  it('accepts workspaces that only have the old structure backfill', () => {
    expect(
      shouldBackfillDemoWorkspace({
        workspace_name: "stefano caruso's Workspace",
        owner_user_id: 'user-123',
        program_count: '5',
        project_count: '15',
        issue_count: '0',
        sprint_count: '0',
        welcome_doc_count: '1',
      })
    ).toBe(true);
  });

  it('keeps full demo workspaces eligible for idempotent backfill passes', () => {
    expect(
      shouldBackfillDemoWorkspace({
        workspace_name: "stefano caruso's Workspace",
        owner_user_id: 'user-123',
        program_count: '5',
        project_count: '15',
        issue_count: '42',
        sprint_count: '15',
        welcome_doc_count: '1',
      })
    ).toBe(true);
  });

  it('keeps setup workspaces eligible even after newer demo expansions land', () => {
    expect(
      shouldBackfillDemoWorkspace({
        workspace_name: "stefano caruso's Workspace",
        owner_user_id: 'user-123',
        program_count: '5',
        project_count: '15',
        issue_count: '120',
        sprint_count: '90',
        welcome_doc_count: '1',
      })
    ).toBe(true);
  });

  it('still backfills missing issue types for full demo workspaces', () => {
    expect(
      shouldBackfillMissingIssueTypesForWorkspace({
        workspace_name: "stefano caruso's Workspace",
        owner_user_id: 'user-123',
        program_count: '5',
        project_count: '15',
        issue_count: '42',
        sprint_count: '15',
        welcome_doc_count: '1',
      })
    ).toBe(true);
  });

  it('skips issue type backfill for non-setup workspaces', () => {
    expect(
      shouldBackfillMissingIssueTypesForWorkspace({
        workspace_name: 'Ship Workspace',
        owner_user_id: 'user-123',
        program_count: '5',
        project_count: '15',
        issue_count: '42',
        sprint_count: '15',
        welcome_doc_count: '1',
      })
    ).toBe(false);
  });

  it('avoids MAX on UUID workspace member ids in the backfill query', () => {
    expect(DEMO_WORKSPACE_OWNER_SELECTION_SQL).toContain('array_agg');
    expect(DEMO_WORKSPACE_OWNER_SELECTION_SQL).not.toContain('MAX(');
  });
});
