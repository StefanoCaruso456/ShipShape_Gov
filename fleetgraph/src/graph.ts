import { END, MemorySaver, START, StateGraph } from '@langchain/langgraph';
import { completeRunNode } from './nodes/complete-run.js';
import { fallbackNode } from './nodes/fallback.js';
import { initializeOnDemandContextNode } from './nodes/initialize-on-demand-context.js';
import { initializeProactiveContextNode } from './nodes/initialize-proactive-context.js';
import { resolveContextNode } from './nodes/resolve-context.js';
import { supervisorEntryNode } from './nodes/supervisor-entry.js';
import { FleetGraphStateAnnotation } from './state.js';

export function createFleetGraph() {
  return new StateGraph(FleetGraphStateAnnotation)
    .addNode('supervisorEntry', supervisorEntryNode, {
      ends: ['initializeProactiveContext', 'initializeOnDemandContext', 'fallback'],
    })
    .addNode('initializeProactiveContext', initializeProactiveContextNode, {
      ends: ['resolveContext'],
    })
    .addNode('initializeOnDemandContext', initializeOnDemandContextNode, {
      ends: ['resolveContext', 'fallback'],
    })
    .addNode('resolveContext', resolveContextNode, {
      ends: ['completeRun'],
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
