import { Annotation } from '@langchain/langgraph';
import type {
  FleetGraphActor,
  FleetGraphDerivedSignals,
  FleetGraphEntityRef,
  FleetGraphErrorState,
  FleetGraphFetchedPayloads,
  FleetGraphFinding,
  FleetGraphHandoff,
  FleetGraphInterventionEvent,
  FleetGraphPendingApproval,
  FleetGraphProposedAction,
  FleetGraphRunMode,
  FleetGraphScope,
  FleetGraphStatus,
  FleetGraphTraceMetadata,
  FleetGraphTriggerType,
} from './types.js';

export const FleetGraphStateAnnotation = Annotation.Root({
  runId: Annotation<string | null>({
    reducer: (left, right) => right ?? left,
    default: () => null,
  }),
  status: Annotation<FleetGraphStatus>({
    reducer: (left, right) => right ?? left,
    default: () => 'starting',
  }),
  stage: Annotation<string | null>({
    reducer: (left, right) => right ?? left,
    default: () => null,
  }),
  mode: Annotation<FleetGraphRunMode | null>({
    reducer: (left, right) => right ?? left,
    default: () => null,
  }),
  triggerType: Annotation<FleetGraphTriggerType | null>({
    reducer: (left, right) => right ?? left,
    default: () => null,
  }),
  workspaceId: Annotation<string | null>({
    reducer: (left, right) => right ?? left,
    default: () => null,
  }),
  actor: Annotation<FleetGraphActor | null>({
    reducer: (left, right) => right ?? left,
    default: () => null,
  }),
  contextEntity: Annotation<FleetGraphEntityRef | null>({
    reducer: (left, right) => right ?? left,
    default: () => null,
  }),
  expandedScope: Annotation<FleetGraphScope>({
    reducer: (left, right) => right ?? left,
    default: () => ({
      issueId: null,
      weekId: null,
      projectId: null,
      programId: null,
      personId: null,
    }),
  }),
  fetched: Annotation<FleetGraphFetchedPayloads>({
    reducer: (left, right) => right ?? left,
    default: () => ({
      entity: null,
      activity: null,
      accountability: null,
      people: null,
      supporting: null,
    }),
  }),
  derivedSignals: Annotation<FleetGraphDerivedSignals>({
    reducer: (left, right) => right ?? left,
    default: () => ({
      severity: 'none',
      reasons: [],
    }),
  }),
  finding: Annotation<FleetGraphFinding | null>({
    reducer: (left, right) => right ?? left,
    default: () => null,
  }),
  proposedAction: Annotation<FleetGraphProposedAction | null>({
    reducer: (left, right) => right ?? left,
    default: () => null,
  }),
  pendingApproval: Annotation<FleetGraphPendingApproval | null>({
    reducer: (left, right) => right ?? left,
    default: () => null,
  }),
  handoff: Annotation<FleetGraphHandoff | null>({
    reducer: (left, right) => right ?? left,
    default: () => null,
  }),
  interventions: Annotation<FleetGraphInterventionEvent[]>({
    reducer: (left, right) => left.concat(right ?? []),
    default: () => [],
  }),
  error: Annotation<FleetGraphErrorState | null>({
    reducer: (left, right) => right ?? left,
    default: () => null,
  }),
  trace: Annotation<FleetGraphTraceMetadata>({
    reducer: (left, right) => right ?? left,
    default: () => ({
      runName: null,
      tags: [],
    }),
  }),
});

export type FleetGraphState = typeof FleetGraphStateAnnotation.State;
export type FleetGraphStateUpdate = typeof FleetGraphStateAnnotation.Update;
