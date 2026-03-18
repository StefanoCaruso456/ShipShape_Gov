import { END, MemorySaver, START, StateGraph } from '@langchain/langgraph';
import { completeRunNode } from './nodes/complete-run.js';
import { deriveSprintSignalsNode } from './nodes/derive-sprint-signals.js';
import { executeProposedActionNode } from './nodes/execute-proposed-action.js';
import { fetchSprintContextNode } from './nodes/fetch-sprint-context.js';
import { fallbackNode } from './nodes/fallback.js';
import { humanApprovalGateNode } from './nodes/human-approval-gate.js';
import { initializeOnDemandContextNode } from './nodes/initialize-on-demand-context.js';
import { initializeProactiveContextNode } from './nodes/initialize-proactive-context.js';
import { proposeSprintActionNode } from './nodes/propose-sprint-action.js';
import { reasonAboutSprintNode } from './nodes/reason-about-sprint.js';
import { recordSignalFindingNode } from './nodes/record-signal-finding.js';
import { resolveContextNode } from './nodes/resolve-context.js';
import { resolveWeekScopeNode } from './nodes/resolve-week-scope.js';
import { supervisorEntryNode } from './nodes/supervisor-entry.js';
import { FleetGraphStateAnnotation } from './state.js';

export function createFleetGraph() {
  return new StateGraph(FleetGraphStateAnnotation)
    .addNode('supervisorEntry', supervisorEntryNode, {
      ends: ['initializeProactiveContext', 'initializeOnDemandContext', 'fallback'],
    })
    .addNode('initializeProactiveContext', initializeProactiveContextNode, {
      ends: ['resolveContext', 'fallback'],
    })
    .addNode('initializeOnDemandContext', initializeOnDemandContextNode, {
      ends: ['resolveContext', 'fallback'],
    })
    .addNode('resolveContext', resolveContextNode, {
      ends: ['fetchSprintContext', 'resolveWeekScope', 'completeRun', 'fallback'],
    })
    .addNode('resolveWeekScope', resolveWeekScopeNode, {
      ends: ['fetchSprintContext', 'completeRun', 'fallback'],
    })
    .addNode('fetchSprintContext', fetchSprintContextNode, {
      ends: ['deriveSprintSignals', 'completeRun', 'fallback'],
    })
    .addNode('deriveSprintSignals', deriveSprintSignalsNode, {
      ends: ['recordSignalFinding', 'reasonAboutSprint', 'completeRun', 'fallback'],
    })
    .addNode('recordSignalFinding', recordSignalFindingNode, {
      ends: ['reasonAboutSprint', 'completeRun', 'fallback'],
    })
    .addNode('reasonAboutSprint', reasonAboutSprintNode, {
      ends: ['proposeSprintAction', 'completeRun', 'fallback'],
    })
    .addNode('proposeSprintAction', proposeSprintActionNode, {
      ends: ['humanApprovalGate', 'completeRun', 'fallback'],
    })
    .addNode('humanApprovalGate', humanApprovalGateNode, {
      ends: ['executeProposedAction', 'completeRun', 'fallback'],
    })
    .addNode('executeProposedAction', executeProposedActionNode, {
      ends: ['completeRun', 'fallback'],
    })
    .addNode('completeRun', completeRunNode)
    .addNode('fallback', fallbackNode)
    .addEdge(START, 'supervisorEntry')
    .addEdge('completeRun', END)
    .addEdge('fallback', END)
    .compile({
      checkpointer: new MemorySaver(),
    });
}
