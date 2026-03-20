import type { FleetGraphEvidenceToolName, FleetGraphScrumSurface } from '../types.js';

type FleetGraphEvidenceToolExecutor = 'ship_api_read';

export interface FleetGraphEvidenceToolDefinition {
  name: FleetGraphEvidenceToolName;
  description: string;
  purpose: string;
  targetSurfaces: FleetGraphScrumSurface[];
  executor: FleetGraphEvidenceToolExecutor;
  toolVersion: 'v1';
}

export const FLEETGRAPH_EVIDENCE_TOOL_REGISTRY: Record<
  FleetGraphEvidenceToolName,
  FleetGraphEvidenceToolDefinition
> = {
  get_surface_context: {
    name: 'get_surface_context',
    description: 'Resolve the current Ship surface into a stable scrum reasoning scope.',
    purpose:
      'Use when FleetGraph needs to map the current route, tab, and scope to the right sprint, project, or page-aware fallback.',
    targetSurfaces: ['my_week', 'sprint', 'project_issues', 'program_issues', 'project', 'program', 'document'],
    executor: 'ship_api_read',
    toolVersion: 'v1',
  },
  get_visible_issue_worklist: {
    name: 'get_visible_issue_worklist',
    description: 'Fetch and normalize the visible issue list for a scoped issues surface.',
    purpose:
      'Use when FleetGraph needs stale, stuck, owner, priority, and cluster evidence from the exact worklist the user is viewing.',
    targetSurfaces: ['project_issues', 'program_issues', 'sprint'],
    executor: 'ship_api_read',
    toolVersion: 'v1',
  },
  get_sprint_snapshot: {
    name: 'get_sprint_snapshot',
    description: 'Fetch a normalized sprint execution snapshot from Ship APIs.',
    purpose:
      'Use when FleetGraph needs sprint entity details, context, activity, and review-context evidence in one bounded fetch step.',
    targetSurfaces: ['my_week', 'sprint', 'project', 'project_issues', 'program_issues', 'document'],
    executor: 'ship_api_read',
    toolVersion: 'v1',
  },
  get_scrum_artifact_status: {
    name: 'get_scrum_artifact_status',
    description: 'Fetch plan, standup, retro, and review status for the scoped scrum work.',
    purpose:
      'Use when FleetGraph needs execution-artifact hygiene signals instead of only issue movement.',
    targetSurfaces: ['my_week', 'sprint', 'project'],
    executor: 'ship_api_read',
    toolVersion: 'v1',
  },
  get_scope_change_signals: {
    name: 'get_scope_change_signals',
    description: 'Fetch and normalize what changed after sprint start.',
    purpose:
      'Use when FleetGraph needs to reason about added work, displaced work, and scope drift.',
    targetSurfaces: ['sprint', 'project_issues', 'program_issues', 'project'],
    executor: 'ship_api_read',
    toolVersion: 'v1',
  },
  get_dependency_signals: {
    name: 'get_dependency_signals',
    description: 'Fetch and normalize blocked work and dependency signals.',
    purpose:
      'Use when FleetGraph needs explicit blocker and dependency evidence instead of inferring everything from issue state alone.',
    targetSurfaces: ['sprint', 'project_issues', 'program_issues', 'project'],
    executor: 'ship_api_read',
    toolVersion: 'v1',
  },
  get_team_ownership_and_capacity: {
    name: 'get_team_ownership_and_capacity',
    description: 'Fetch ownership and workload signals for scoped scrum work.',
    purpose:
      'Use when FleetGraph needs to reason about unclear ownership, overloaded people, or follow-up accountability.',
    targetSurfaces: ['my_week', 'sprint', 'project_issues', 'program_issues', 'project'],
    executor: 'ship_api_read',
    toolVersion: 'v1',
  },
  get_business_value_context: {
    name: 'get_business_value_context',
    description: 'Fetch project-backed business value signals for scoped work.',
    purpose:
      'Use when FleetGraph needs business-value context alongside execution risk.',
    targetSurfaces: ['project_issues', 'program_issues', 'project', 'program'],
    executor: 'ship_api_read',
    toolVersion: 'v1',
  },
};

export function getFleetGraphEvidenceToolDefinition(
  toolName: FleetGraphEvidenceToolName
): FleetGraphEvidenceToolDefinition {
  return FLEETGRAPH_EVIDENCE_TOOL_REGISTRY[toolName];
}
