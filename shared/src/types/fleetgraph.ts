import type { DocumentType } from './document.js';

export type FleetGraphViewSurface =
  | 'document'
  | 'dashboard'
  | 'my_week'
  | 'week'
  | 'project'
  | 'program'
  | 'issue'
  | 'person';

export type FleetGraphViewEntityType =
  | 'issue'
  | 'week'
  | 'project'
  | 'program'
  | 'person';

export interface FleetGraphActiveViewEntityRef {
  id: string;
  type: FleetGraphViewEntityType;
  sourceDocumentType: DocumentType;
}

export interface FleetGraphActiveViewContext {
  entity: FleetGraphActiveViewEntityRef;
  surface: FleetGraphViewSurface;
  route: string;
  tab: string | null;
  projectId: string | null;
}

export interface FleetGraphOnDemandRequest {
  active_view: FleetGraphActiveViewContext;
  question?: string | null;
}
