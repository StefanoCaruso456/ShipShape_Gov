import { describe, expect, it } from 'vitest';
import {
  buildFleetGraphActiveViewContext,
  buildFleetGraphMyWeekActiveViewContext,
} from './fleetgraph';

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

  it('maps weekly plan documents back to the owning project scope when project context is present', () => {
    const activeView = buildFleetGraphActiveViewContext({
      currentDocumentId: '33333333-3333-3333-3333-333333333333',
      currentDocumentType: 'weekly_plan',
      currentDocumentProjectId: '22222222-2222-2222-2222-222222222222',
      currentDocumentTab: null,
      pathname: '/documents/33333333-3333-3333-3333-333333333333',
    });

    expect(activeView).toEqual({
      entity: {
        id: '22222222-2222-2222-2222-222222222222',
        type: 'project',
        sourceDocumentType: 'weekly_plan',
      },
      surface: 'document',
      route: '/documents/33333333-3333-3333-3333-333333333333',
      tab: null,
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

  it('maps My Week to a person-scoped active view', () => {
    const activeView = buildFleetGraphMyWeekActiveViewContext({
      personId: '44444444-4444-4444-4444-444444444444',
      pathname: '/my-week?week_number=14',
    });

    expect(activeView).toEqual({
      entity: {
        id: '44444444-4444-4444-4444-444444444444',
        type: 'person',
        sourceDocumentType: 'person',
      },
      surface: 'my_week',
      route: '/my-week?week_number=14',
      tab: null,
      projectId: null,
    });
  });

  it('preserves a narrowed project when My Week already has a single project in scope', () => {
    const activeView = buildFleetGraphMyWeekActiveViewContext({
      personId: '44444444-4444-4444-4444-444444444444',
      pathname: '/my-week?week_number=14',
      projectId: '55555555-5555-5555-5555-555555555555',
    });

    expect(activeView).toEqual({
      entity: {
        id: '44444444-4444-4444-4444-444444444444',
        type: 'person',
        sourceDocumentType: 'person',
      },
      surface: 'my_week',
      route: '/my-week?week_number=14',
      tab: null,
      projectId: '55555555-5555-5555-5555-555555555555',
    });
  });
});
