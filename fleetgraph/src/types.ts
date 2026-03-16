export type FleetGraphRunMode = 'proactive' | 'on_demand';

export type FleetGraphTriggerType =
  | 'event'
  | 'sweep'
  | 'user_invoke'
  | 'resume';

export type FleetGraphStatus =
  | 'starting'
  | 'running'
  | 'waiting_on_human'
  | 'completed'
  | 'failed';

export type FleetGraphActorKind = 'user' | 'service';

export type FleetGraphEntityType =
  | 'issue'
  | 'week'
  | 'project'
  | 'program'
  | 'person';

export interface FleetGraphActor {
  id: string | null;
  kind: FleetGraphActorKind;
  role: string | null;
}

export interface FleetGraphEntityRef {
  type: FleetGraphEntityType;
  id: string;
}

export interface FleetGraphScope {
  issueId: string | null;
  weekId: string | null;
  projectId: string | null;
  programId: string | null;
  personId: string | null;
}

export interface FleetGraphFetchedPayloads {
  entity: unknown | null;
  activity: unknown | null;
  accountability: unknown | null;
  people: unknown | null;
  supporting: unknown | null;
}

export interface FleetGraphDerivedSignals {
  severity: 'none' | 'info' | 'warning' | 'action';
  reasons: string[];
}

export interface FleetGraphFinding {
  summary: string;
  severity: FleetGraphDerivedSignals['severity'];
}

export interface FleetGraphProposedAction {
  type: string;
  targetId: string | null;
  summary: string;
}

export interface FleetGraphPendingApproval {
  actionType: string;
  reason: string;
}

export interface FleetGraphErrorState {
  code: string;
  message: string;
  retryable: boolean;
  source: string | null;
}

export interface FleetGraphTraceMetadata {
  runName: string | null;
  tags: string[];
}

export interface FleetGraphHandoff {
  fromNode: string;
  toNode: string;
  reason: string;
}

export interface FleetGraphInterventionEvent {
  kind: 'reroute' | 'pause' | 'resume' | 'retry' | 'fail_safe_exit';
  reason: string;
  atStage: string | null;
}
