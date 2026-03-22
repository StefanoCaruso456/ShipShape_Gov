import { extractText } from './document-content.js';

export type IssueTemplateType = 'story' | 'bug' | 'task' | 'spike' | 'chore';

type TipTapNode = Record<string, unknown>;

interface IssueTemplateOptions {
  title: string;
  issueType?: IssueTemplateType | null;
  projectLabel?: string | null;
  mode?: 'blank' | 'filled';
}

function textNode(text: string): TipTapNode {
  return { type: 'text', text };
}

function paragraph(text: string): TipTapNode {
  return {
    type: 'paragraph',
    content: [textNode(text)],
  };
}

function heading(text: string, level: 2 | 3 = 2): TipTapNode {
  return {
    type: 'heading',
    attrs: { level },
    content: [textNode(text)],
  };
}

function bulletList(items: string[]): TipTapNode {
  return {
    type: 'bulletList',
    content: items.map((item) => ({
      type: 'listItem',
      content: [paragraph(item)],
    })),
  };
}

function normalizeProjectLabel(projectLabel?: string | null): string | null {
  const value = (projectLabel ?? '').trim();
  return value.length > 0 ? value.toLowerCase() : null;
}

function stripProjectPrefix(title: string): string {
  const separatorIndex = title.indexOf(':');
  if (separatorIndex < 0) {
    return title.trim();
  }

  return title.slice(separatorIndex + 1).trim();
}

function toGoalPhrase(title: string): string {
  const normalizedTitle = stripProjectPrefix(title);
  if (normalizedTitle.length === 0) {
    return 'to move this work forward';
  }

  const lowerTitle = normalizedTitle.charAt(0).toLowerCase() + normalizedTitle.slice(1);
  return lowerTitle.startsWith('to ') ? lowerTitle : `to ${lowerTitle}`;
}

function getUserStoryActor(projectLabel?: string | null): string {
  const normalizedProjectLabel = normalizeProjectLabel(projectLabel);
  if (normalizedProjectLabel) {
    return `a teammate working on ${normalizedProjectLabel}`;
  }

  return 'a user or teammate';
}

function getBenefit(issueType?: IssueTemplateType | null): string {
  switch (issueType) {
    case 'bug':
      return 'the workflow is reliable and easier to trust';
    case 'spike':
      return 'we can make a confident implementation decision';
    case 'chore':
      return 'delivery stays reliable and the area stays easy to support';
    case 'task':
      return 'the work stays clear, testable, and ready to ship';
    case 'story':
    default:
      return 'the work is clear, valuable, and ready to verify';
  }
}

function getAcceptanceCriteria(issueType?: IssueTemplateType | null, mode: 'blank' | 'filled' = 'blank'): string[] {
  if (mode === 'blank') {
    return [
      '[What must be true for this issue to be complete?]',
      '[What edge cases, dependencies, or validations matter?]',
      '[How will we verify the result?]',
    ];
  }

  switch (issueType) {
    case 'bug':
      return [
        'The failing behavior and the expected behavior are clearly described.',
        'The affected flow no longer reproduces the bug after the change.',
        'Verification notes or regression coverage are captured for review.',
      ];
    case 'spike':
      return [
        'The investigation question and scope are clearly defined.',
        'Key findings, tradeoffs, or constraints are documented.',
        'A recommendation or clear next step is captured for the team.',
      ];
    case 'chore':
      return [
        'The maintenance or cleanup scope is clearly defined.',
        'Any related docs, config, or test updates are included in the plan.',
        'The area is left easier to support, review, or extend.',
      ];
    case 'task':
      return [
        'The expected change or deliverable is clearly described.',
        'Relevant dependencies, edge cases, and validation steps are captured.',
        'The result can be reviewed and verified without extra clarification.',
      ];
    case 'story':
    default:
      return [
        'The expected workflow or behavior is clearly described.',
        'Relevant edge cases, validation, and dependencies are captured.',
        'The result is ready for review and can be verified end to end.',
      ];
  }
}

function getContextText(options: IssueTemplateOptions, mode: 'blank' | 'filled'): string {
  if (mode === 'blank') {
    return '[Relevant background, constraints, links, or notes.]';
  }

  const projectLabel = normalizeProjectLabel(options.projectLabel);
  if (projectLabel) {
    return `This issue moves the ${projectLabel} work forward and should stay scoped enough to move through review cleanly.`;
  }

  return 'Capture the key context, constraints, and dependencies needed to complete this work cleanly.';
}

export function createIssueTemplateContent(options: IssueTemplateOptions): Record<string, unknown> {
  const mode = options.mode ?? 'blank';

  if (mode === 'blank') {
    return {
      type: 'doc',
      content: [
        heading('User Story'),
        paragraph('As a [user, teammate, or stakeholder],'),
        paragraph('I want [desired outcome],'),
        paragraph('so that [value or impact].'),
        heading('Context'),
        paragraph(getContextText(options, mode)),
        heading('Acceptance Criteria'),
        bulletList(getAcceptanceCriteria(options.issueType, mode)),
      ],
    };
  }

  return {
    type: 'doc',
    content: [
      heading('User Story'),
      paragraph(`As ${getUserStoryActor(options.projectLabel)},`),
      paragraph(`I want ${toGoalPhrase(options.title)},`),
      paragraph(`so that ${getBenefit(options.issueType)}.`),
      heading('Context'),
      paragraph(getContextText(options, mode)),
      heading('Acceptance Criteria'),
      bulletList(getAcceptanceCriteria(options.issueType, mode)),
    ],
  };
}

export function shouldPopulateIssueTemplate(content: unknown): boolean {
  return extractText(content).trim().length === 0;
}
