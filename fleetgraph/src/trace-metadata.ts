import type { FleetGraphState } from './state.js';
import type {
  FleetGraphDerivedSignal,
  FleetGraphEntityRef,
  FleetGraphRunInput,
  FleetGraphScope,
  FleetGraphTraceMetadata,
} from './types.js';
import { inferFleetGraphQuestionTheme } from './question-theme.js';

function dedupeStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(values.filter((value): value is string => typeof value === 'string' && value.length > 0))
  );
}

function deriveScopeFromEntityRef(entity: FleetGraphEntityRef | null | undefined): FleetGraphScope {
  if (!entity) {
    return {
      issueId: null,
      weekId: null,
      projectId: null,
      programId: null,
      personId: null,
    };
  }

  return {
    issueId: entity.type === 'issue' ? entity.id : null,
    weekId: entity.type === 'week' ? entity.id : null,
    projectId: entity.type === 'project' ? entity.id : null,
    programId: entity.type === 'program' ? entity.id : null,
    personId: entity.type === 'person' ? entity.id : null,
  };
}

function dedupeSignalKinds(
  signals: Array<Pick<FleetGraphDerivedSignal, 'kind'>>
): FleetGraphTraceMetadata['metadata']['signalKinds'] {
  return Array.from(new Set(signals.map((signal) => signal.kind)));
}

type PartialTraceMetadataFields = Partial<FleetGraphTraceMetadata['metadata']>;

function createBaseTraceMetadata(): FleetGraphTraceMetadata['metadata'] {
  return {
    schemaVersion: 'v1',
    runId: null,
    threadId: null,
    mode: null,
    triggerType: null,
    workspaceId: null,
    actorId: null,
    actorKind: null,
    actorRole: null,
    actorWorkPersona: null,
    activeViewSurface: null,
    activeViewRoute: null,
    activeViewTab: null,
    activeEntityId: null,
    activeEntityType: null,
    activeEntitySourceDocumentType: null,
    contextEntityId: null,
    contextEntityType: null,
    issueId: null,
    weekId: null,
    projectId: null,
    programId: null,
    personId: null,
    questionSource: null,
    questionTheme: null,
    answerMode: null,
    status: null,
    stage: null,
    terminalOutcome: null,
    signalSeverity: null,
    signalKinds: [],
    reasoningSource: null,
    pendingApproval: false,
    proposedActionType: null,
    actionOutcome: null,
    suppressionReason: null,
    lastNode: null,
    nodeCount: 0,
    toolCallCount: 0,
    approvalCount: 0,
  };
}

function mergeTraceMetadata(
  base: FleetGraphTraceMetadata['metadata'],
  override?: PartialTraceMetadataFields | null
): FleetGraphTraceMetadata['metadata'] {
  if (!override) {
    return base;
  }

  return {
    ...base,
    ...override,
    signalKinds:
      override.signalKinds && override.signalKinds.length > 0
        ? Array.from(new Set(override.signalKinds))
        : base.signalKinds,
  };
}

export function buildFleetGraphTraceFromInput(
  input: FleetGraphRunInput,
  options?: {
    threadId?: string | null;
  }
): FleetGraphTraceMetadata {
  const activeView = input.activeView ?? null;
  const contextEntity = input.contextEntity ?? null;
  const derivedScope = deriveScopeFromEntityRef(contextEntity);
  const providedTrace = input.trace ?? null;
  const providedMetadata =
    (providedTrace?.metadata as PartialTraceMetadataFields | undefined) ?? undefined;

  const baseMetadata = createBaseTraceMetadata();
  const metadata = mergeTraceMetadata(
    {
      ...baseMetadata,
      runId: input.runId ?? null,
      threadId: options?.threadId ?? input.runId ?? null,
      mode: input.mode,
      triggerType: input.triggerType,
      workspaceId: input.workspaceId ?? null,
      actorId: input.actor?.id ?? null,
      actorKind: input.actor?.kind ?? null,
      actorRole: input.actor?.role ?? null,
      actorWorkPersona: input.actor?.workPersona ?? null,
      activeViewSurface: activeView?.surface ?? null,
      activeViewRoute: activeView?.route ?? null,
      activeViewTab: activeView?.tab ?? null,
      activeEntityId: activeView?.entity.id ?? null,
      activeEntityType: activeView?.entity.type ?? null,
      activeEntitySourceDocumentType: activeView?.entity.sourceDocumentType ?? null,
      contextEntityId: contextEntity?.id ?? null,
      contextEntityType: contextEntity?.type ?? null,
      issueId: derivedScope.issueId,
      weekId: derivedScope.weekId,
      projectId: activeView?.projectId ?? derivedScope.projectId,
      programId: derivedScope.programId,
      personId: derivedScope.personId,
      questionSource: input.prompt?.questionSource ?? null,
      questionTheme: input.prompt?.question
        ? inferFleetGraphQuestionTheme(input.prompt.question)
        : null,
      status: 'starting',
    },
    providedMetadata
  );

  return {
    runName: providedTrace?.runName ?? null,
    tags: dedupeStrings(providedTrace?.tags ?? []),
    metadata,
  };
}

export function buildFleetGraphTraceFromState(
  state: FleetGraphState,
  options?: {
    traceOverride?: Partial<FleetGraphTraceMetadata> | null;
  }
): FleetGraphTraceMetadata {
  const traceOverride = options?.traceOverride ?? null;
  const providedMetadata =
    (traceOverride?.metadata as PartialTraceMetadataFields | undefined) ?? undefined;

  const metadata = mergeTraceMetadata(
    {
      ...createBaseTraceMetadata(),
      runId: state.runId,
      threadId: state.runId,
      mode: state.mode,
      triggerType: state.triggerType,
      workspaceId: state.workspaceId,
      actorId: state.actor?.id ?? null,
      actorKind: state.actor?.kind ?? null,
      actorRole: state.actor?.role ?? null,
      actorWorkPersona: state.actor?.workPersona ?? null,
      activeViewSurface: state.activeView?.surface ?? null,
      activeViewRoute: state.activeView?.route ?? null,
      activeViewTab: state.activeView?.tab ?? null,
      activeEntityId: state.activeView?.entity.id ?? null,
      activeEntityType: state.activeView?.entity.type ?? null,
      activeEntitySourceDocumentType: state.activeView?.entity.sourceDocumentType ?? null,
      contextEntityId: state.contextEntity?.id ?? null,
      contextEntityType: state.contextEntity?.type ?? null,
      issueId:
        state.expandedScope.issueId ??
        (state.contextEntity?.type === 'issue' ? state.contextEntity.id : null),
      weekId:
        state.expandedScope.weekId ??
        (state.contextEntity?.type === 'week' ? state.contextEntity.id : null),
      projectId:
        state.expandedScope.projectId ??
        state.activeView?.projectId ??
        (state.contextEntity?.type === 'project' ? state.contextEntity.id : null),
      programId:
        state.expandedScope.programId ??
        (state.contextEntity?.type === 'program' ? state.contextEntity.id : null),
      personId:
        state.expandedScope.personId ??
        (state.contextEntity?.type === 'person' ? state.contextEntity.id : null),
      questionSource: state.prompt?.questionSource ?? null,
      questionTheme: state.prompt?.question
        ? inferFleetGraphQuestionTheme(state.prompt.question)
        : null,
      answerMode: state.reasoning?.answerMode ?? null,
      status: state.status,
      stage: state.stage,
      terminalOutcome: state.terminalOutcome,
      signalSeverity: state.derivedSignals.severity,
      signalKinds: dedupeSignalKinds(state.derivedSignals.signals),
      reasoningSource: state.reasoningSource,
      pendingApproval: state.pendingApproval !== null,
      proposedActionType: state.proposedAction?.type ?? null,
      actionOutcome: state.actionResult?.outcome ?? null,
      suppressionReason: state.suppressionReason,
      lastNode: state.lastNode,
      nodeCount: state.nodeHistory.length,
      toolCallCount: state.telemetry.toolCallCount,
      approvalCount: state.telemetry.approvalCount,
    },
    providedMetadata
  );

  return {
    runName: traceOverride?.runName ?? state.trace.runName,
    tags: dedupeStrings([
      ...(state.trace.tags ?? []),
      ...((traceOverride?.tags as string[] | undefined) ?? []),
    ]),
    metadata,
  };
}
