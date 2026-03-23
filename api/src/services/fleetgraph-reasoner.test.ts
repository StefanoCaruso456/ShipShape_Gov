import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  fromRunnableConfigMock,
  runTreeMock,
} = vi.hoisted(() => {
  const runTree = {
    extra: {
      metadata: {},
    },
    postRun: vi.fn().mockResolvedValue(undefined),
    end: vi.fn().mockResolvedValue(undefined),
    patchRun: vi.fn().mockResolvedValue(undefined),
  };

  return {
    fromRunnableConfigMock: vi.fn(() => runTree),
    runTreeMock: runTree,
  };
});

vi.mock('langsmith', () => ({
  RunTree: {
    fromRunnableConfig: fromRunnableConfigMock,
  },
}));

import { createFleetGraphReasoner } from './fleetgraph-reasoner.js';

describe('createFleetGraphReasoner', () => {
  const fetchMock = vi.fn();
  const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'test-openai-key';
    process.env.OPENAI_INPUT_COST_PER_MILLION_USD = '0.4';
    process.env.OPENAI_OUTPUT_COST_PER_MILLION_USD = '1.6';
    vi.stubGlobal('fetch', fetchMock);
    fromRunnableConfigMock.mockClear();
    runTreeMock.extra.metadata = {};
    runTreeMock.postRun.mockClear();
    runTreeMock.end.mockClear();
    runTreeMock.patchRun.mockClear();
    logger.debug.mockClear();
    logger.info.mockClear();
    logger.warn.mockClear();
    logger.error.mockClear();
  });

  afterEach(() => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_INPUT_COST_PER_MILLION_USD;
    delete process.env.OPENAI_OUTPUT_COST_PER_MILLION_USD;
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('records LangSmith usage_metadata and cost metadata for each reasoning API call', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  answerMode: 'execution',
                  summary: 'The sprint is at risk.',
                  evidence: ['Work is stale.'],
                  whyNow: 'Updates have stopped.',
                  recommendedNextStep: 'Confirm the unblock owner.',
                  confidence: 'high',
                }),
              },
            },
          ],
          usage: {
            prompt_tokens: 100,
            completion_tokens: 20,
            total_tokens: 120,
            prompt_tokens_details: {
              cached_tokens: 5,
            },
            completion_tokens_details: {
              reasoning_tokens: 7,
            },
          },
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      )
    );

    const reasoner = createFleetGraphReasoner(logger);
    expect(reasoner).not.toBeNull();

    const result = await reasoner!.reasonAboutSprint(
      {
        activeViewRoute: '/weeks/week-1',
        question: 'Why is this sprint at risk?',
        questionTheme: 'risk',
        workPersona: 'engineering_manager',
        findingSummary: 'Work has stalled.',
        derivedSignals: {
          severity: 'action',
          summary: 'Signals show delivery risk.',
          reasons: ['Low activity'],
          metrics: {
            staleIssues: 2,
          },
          signals: [
            {
              kind: 'stale_work',
              severity: 'action',
              summary: 'Two issues have gone stale.',
              evidence: ['No owner updates in 4 days.'],
            },
          ],
        },
        fetched: {
          entity: {
            id: 'week-1',
            title: 'Week 1',
          },
          accountability: {
            project: {
              id: 'project-1',
            },
            issues: [],
          },
          planning: {
            scopeChanges: [],
          },
        },
      },
      {
        runnableConfig: {
          callbacks: {
            handlers: [],
            getParentRunId: () => 'run-parent',
          },
        } as any,
        traceMetadata: {
          active_view_route: '/weeks/week-1',
        },
      }
    );

    expect(result).toMatchObject({
      answerMode: 'execution',
      summary: 'The sprint is at risk.',
      confidence: 'high',
    });

    expect(fromRunnableConfigMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        name: 'fleetgraph.reasoning.model',
        run_type: 'llm',
        extra: {
          metadata: expect.objectContaining({
            feature: 'fleetgraph_reasoning',
            ls_provider: 'openai',
            ls_model_name: 'gpt-4.1-mini',
            ls_temperature: 0,
            ls_max_tokens: 600,
            active_view_route: '/weeks/week-1',
          }),
        },
      })
    );

    expect(runTreeMock.postRun).toHaveBeenCalledTimes(1);
    expect(runTreeMock.patchRun).toHaveBeenCalledTimes(1);

    expect(runTreeMock.end).toHaveBeenCalledTimes(1);
    const [outputs, error, endTime, metadata] = runTreeMock.end.mock.calls[0]!;

    expect(outputs).toMatchObject({
      parsed: {
        answerMode: 'execution',
      },
      response_text: expect.any(String),
      usage_metadata: {
        input_tokens: 100,
        output_tokens: 20,
        total_tokens: 120,
        input_token_details: {
          cache_read: 5,
        },
        output_token_details: {
          reasoning: 7,
        },
      },
    });
    expect((outputs as { usage_metadata: { total_cost: number } }).usage_metadata.total_cost).toBeCloseTo(
      0.000072,
      12
    );
    expect(error).toBeUndefined();
    expect(endTime).toBeUndefined();
    expect(metadata).toMatchObject({
      response_status: 200,
      fallback: false,
      usage_metadata: {
        input_tokens: 100,
        output_tokens: 20,
        total_tokens: 120,
      },
    });
    expect(
      (metadata as { usage_metadata: { total_cost: number } }).usage_metadata.total_cost
    ).toBeCloseTo(0.000072, 12);
  });

  it('records LangSmith usage_metadata for current-view reasoning calls too', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  answerMode: 'launcher',
                  summary: 'Core Features needs attention first because review wait and after-start scope both show up on this page.',
                  evidence: ['Waiting on review: 1 issue.', 'Added after sprint start: 2 issues.'],
                  whyNow: 'The current page already shows where the review queue and late scope are building.',
                  recommendedNextStep: 'Open review queue Core Features.',
                  confidence: 'high',
                }),
              },
            },
          ],
          usage: {
            prompt_tokens: 140,
            completion_tokens: 32,
            total_tokens: 172,
          },
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      )
    );

    const reasoner = createFleetGraphReasoner(logger);
    expect(reasoner).not.toBeNull();

    const result = await reasoner!.reasonAboutCurrentView(
      {
        activeViewRoute: '/documents/program-1/projects',
        question: 'Where are we waiting on review or approval?',
        questionTheme: 'follow_up',
        workPersona: 'product_manager',
        pageContext: {
          kind: 'projects',
          route: '/documents/program-1/projects',
          title: 'API Platform Projects',
          summary:
            'API Platform points first to Core Features. It has 4 open issues, 1 issue waiting on review, and 2 issues added after sprint start.',
          emptyState: false,
          metrics: [
            { label: 'Visible projects', value: '2' },
            { label: 'Waiting on review', value: '1 issue' },
            { label: 'Added after sprint start', value: '2 issues' },
          ],
          items: [
            {
              label: 'Core Features',
              detail:
                'Needs attention • 4 open issues • Waiting on review: 1 • Added after sprint start: 2 • Owner: stefano caruso',
              route: '/documents/project-1/issues',
            },
          ],
          actions: [
            {
              label: 'Open review queue Core Features',
              route: '/documents/project-1/issues',
              intent: 'follow_up',
              reason: 'Core Features is waiting on review for 1 issue.',
              owner: 'stefano caruso',
            },
          ],
        },
        deterministicDraft: {
          answerMode: 'launcher',
          summary: 'Core Features is where review wait is visible on this page.',
          evidence: ['Waiting on review: 1 issue.'],
          whyNow: 'The projects tab shows the review queue directly.',
          recommendedNextStep: 'Open review queue Core Features.',
          confidence: 'medium',
        },
      },
      {
        runnableConfig: {
          callbacks: {
            handlers: [],
            getParentRunId: () => 'run-parent',
          },
        } as any,
        traceMetadata: {
          active_view_route: '/documents/program-1/projects',
          page_context_kind: 'projects',
        },
      }
    );

    expect(result).toMatchObject({
      answerMode: 'launcher',
      summary: expect.stringContaining('Core Features needs attention first'),
      confidence: 'high',
    });

    expect(fromRunnableConfigMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        name: 'fleetgraph.current_view.model',
        run_type: 'llm',
        extra: {
          metadata: expect.objectContaining({
            feature: 'fleetgraph_current_view_reasoning',
            ls_provider: 'openai',
            ls_model_name: 'gpt-4.1-mini',
            active_view_route: '/documents/program-1/projects',
            page_context_kind: 'projects',
          }),
        },
        tags: expect.arrayContaining(['current_view', 'page_kind:projects', 'persona:product_manager']),
      })
    );

    const [outputs, error, endTime, metadata] = runTreeMock.end.mock.calls[0]!;
    expect(outputs).toMatchObject({
      parsed: {
        answerMode: 'launcher',
      },
      usage_metadata: {
        input_tokens: 140,
        output_tokens: 32,
        total_tokens: 172,
      },
    });
    expect(error).toBeUndefined();
    expect(endTime).toBeUndefined();
    expect(metadata).toMatchObject({
      response_status: 200,
      fallback: false,
      usage_metadata: {
        input_tokens: 140,
        output_tokens: 32,
        total_tokens: 172,
      },
    });
  });
});
