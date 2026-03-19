import { Command } from '@langchain/langgraph';
import type { RunnableConfig } from '@langchain/core/runnables';
import type { FleetGraphPageContext } from '@ship/shared';
import { beginFleetGraphNode, createFleetGraphCommand } from '../node-runtime.js';
import type { FleetGraphState } from '../state.js';
import { createHandoff } from '../supervision.js';
import type { FleetGraphReasoning } from '../types.js';

type ReasonAboutCurrentViewTargets = 'completeRun' | 'fallback';

function buildEvidence(pageContext: FleetGraphPageContext): string[] {
  const metricEvidence = pageContext.metrics.map((metric) => `${metric.label}: ${metric.value}`);
  const itemEvidence = pageContext.items
    .map((item) => (item.detail ? `${item.label}: ${item.detail}` : item.label))
    .slice(0, 4);

  return [...metricEvidence, ...itemEvidence].slice(0, 6);
}

function buildRecommendedNextStep(pageContext: FleetGraphPageContext): string | null {
  if (pageContext.emptyState) {
    switch (pageContext.kind) {
      case 'programs':
        return 'Create the first program in this workspace or switch to the workspace that already has active work.';
      case 'projects':
        return 'Create a project, or open the owning program first if this workspace is still being structured.';
      case 'issues':
        return 'Create or capture the first issue so the team has a concrete backlog to review here.';
      case 'documents':
        return 'Create a document or open an existing one so FleetGraph has something concrete to reference on this surface.';
      default:
        return 'Add work to this page or switch to a surface with active work before asking for deeper analysis.';
    }
  }

  switch (pageContext.kind) {
    case 'programs':
      return 'Open the program that looks most active or least clear so you can inspect its projects, issues, and current sprint.';
    case 'projects':
      return 'Open the project that needs the most attention, then use its sprint or weekly docs for deeper execution analysis.';
    case 'issues':
      return 'Triage the highest-signal issues first, then open the owning project or sprint if you need execution context.';
    case 'documents':
      return 'Open the document that best matches your question so FleetGraph can reason over the work in more detail.';
    case 'team_directory':
      return 'Open the person or team surface that owns this work if you need accountability, role, or follow-up context.';
    case 'dashboard':
      return 'Use this page to decide where to drill in next, then open the specific sprint, project, or document that needs action.';
    case 'document':
    case 'person':
      return 'Stay on this document if you want doc-specific guidance, or open a related sprint/project view for execution risk analysis.';
    default:
      return 'Use this page snapshot to decide the next document, person, or project you want to inspect.';
  }
}

function buildSummary(pageContext: FleetGraphPageContext, question: string | null): string {
  const normalizedQuestion = question?.trim().toLowerCase() ?? '';
  const summary = pageContext.summary;

  if (!normalizedQuestion) {
    return summary;
  }

  if (
    normalizedQuestion.includes('next') ||
    normalizedQuestion.includes('what should happen') ||
    normalizedQuestion.includes('what do i do')
  ) {
    return pageContext.emptyState
      ? `${summary} There is no active work on this page yet, so the next move is to create or open the right work surface first.`
      : `${summary} This page is best used to decide what to open or follow up on next.`;
  }

  if (
    normalizedQuestion.includes('risk') ||
    normalizedQuestion.includes('at risk') ||
    normalizedQuestion.includes('blocked')
  ) {
    return `${summary} This page gives portfolio and navigation context rather than full sprint-risk evidence, so use it to identify the right work to inspect next.`;
  }

  if (
    normalizedQuestion.includes('summarize') ||
    normalizedQuestion.includes('what is on this page') ||
    normalizedQuestion.includes('what am i looking at')
  ) {
    return summary;
  }

  return `${summary} FleetGraph is grounding this answer in the current page snapshot rather than a sprint-only view.`;
}

function buildReasoning(pageContext: FleetGraphPageContext, question: string | null): FleetGraphReasoning {
  const evidence = buildEvidence(pageContext);

  return {
    summary: buildSummary(pageContext, question),
    evidence,
    whyNow: 'This answer is grounded in the work visible on the page you are currently viewing.',
    recommendedNextStep: buildRecommendedNextStep(pageContext),
    confidence: evidence.length >= 3 ? 'high' : evidence.length > 0 ? 'medium' : 'low',
  };
}

export async function reasonAboutCurrentViewNode(
  state: FleetGraphState,
  config?: RunnableConfig
): Promise<Command<ReasonAboutCurrentViewTargets>> {
  const started = beginFleetGraphNode(state, config, {
    nodeName: 'reasonAboutCurrentView',
    phase: 'reasoning',
    guardFailureTarget: 'fallback',
  });
  const runtime = started.runtime;

  if ('command' in started) {
    return started.command;
  }

  const pageContext = state.prompt?.pageContext ?? null;

  if (!pageContext) {
    return createFleetGraphCommand(
      started.context,
      'completeRun',
      {
        stage: 'current_view_reasoning_skipped',
        handoff: createHandoff(
          'reasonAboutCurrentView',
          'completeRun',
          'no page context was available for current-view reasoning'
        ),
      }
    );
  }

  runtime.logger.debug('Reasoning about FleetGraph current-view page context', {
    kind: pageContext.kind,
    route: pageContext.route,
    title: pageContext.title,
    emptyState: pageContext.emptyState,
  });

  return createFleetGraphCommand(
    started.context,
    'completeRun',
    {
      stage: 'current_view_reasoned',
      reasoning: buildReasoning(pageContext, state.prompt?.question ?? null),
      reasoningSource: 'deterministic',
      attempts: {
        ...state.attempts,
        reasoning: state.attempts.reasoning + 1,
      },
      handoff: createHandoff(
        'reasonAboutCurrentView',
        'completeRun',
        'generated a grounded answer from the current page snapshot'
      ),
    }
  );
}
