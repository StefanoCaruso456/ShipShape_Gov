import { describe, expect, it } from 'vitest';
import { buildFleetGraphActiveViewContext } from './fleetgraph';

describe('buildFleetGraphActiveViewContext', () => {
  it('maps sprint documents to a week active-view entity', () => {
    const activeView = buildFleetGraphActiveViewContext({
      currentDocumentId: '11111111-1111-1111-1111-111111111111',
      currentDocumentType: 'sprint',
      currentDocumentProjectId: '22222222-2222-2222-2222-222222222222',
      currentDocumentTab: 'issues',
      pathname: '/documents/11111111-1111-1111-1111-111111111111/issues',
    });

    expect(activeView).toEqual({
      entity: {
        id: '11111111-1111-1111-1111-111111111111',
        type: 'week',
        sourceDocumentType: 'sprint',
      },
      surface: 'document',
      route: '/documents/11111111-1111-1111-1111-111111111111/issues',
      tab: 'issues',
      projectId: '22222222-2222-2222-2222-222222222222',
    });
  });

  it('returns null for document types that do not yet map into FleetGraph MVP context', () => {
    const activeView = buildFleetGraphActiveViewContext({
      currentDocumentId: '33333333-3333-3333-3333-333333333333',
      currentDocumentType: 'weekly_plan',
      currentDocumentProjectId: null,
      currentDocumentTab: null,
      pathname: '/documents/33333333-3333-3333-3333-333333333333',
    });

    expect(activeView).toBeNull();
  });
});
