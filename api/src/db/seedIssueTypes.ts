export const SEEDED_ISSUE_TYPES = ['story', 'bug', 'task', 'spike', 'chore'] as const;

export type SeededIssueType = (typeof SEEDED_ISSUE_TYPES)[number];

const WEIGHTED_ISSUE_TYPE_ROTATION: SeededIssueType[] = [
  'story',
  'story',
  'bug',
  'task',
  'story',
  'chore',
  'task',
  'bug',
  'spike',
  'task',
];

const SPIKE_PATTERNS = [
  /\bexplor(?:e|ing)\b/i,
  /\bstretch\b/i,
  /\bspike\b/i,
  /\binvestigat(?:e|ion)\b/i,
  /\bprototype\b/i,
  /\bproof of concept\b/i,
  /\bresearch\b/i,
  /\bexperiment(?:al)?\b/i,
];

const CHORE_PATTERNS = [
  /\bexpand test coverage\b/i,
  /\btest coverage\b/i,
  /\bunit tests?\b/i,
  /\bintegration tests?\b/i,
  /\bdocs?\b/i,
  /\bdocumentation\b/i,
  /\bset up\b/i,
  /\bsetup\b/i,
  /\bconfigure\b/i,
  /\bcleanup\b/i,
  /\bclean up\b/i,
  /\brefactor\b/i,
  /\bcoding standards?\b/i,
  /\bstaging environment\b/i,
  /\bexport to pdf\b/i,
];

const BUG_PATTERNS = [
  /\bbug\b/i,
  /\bbug fixes?\b/i,
  /\bfix(?:es|ing)?\b/i,
  /\bstability\b/i,
  /\berror handling\b/i,
  /\bedge[- ]case\b/i,
  /\bvalidation\b/i,
  /\bsecurity audit\b/i,
  /\bcsrf\b/i,
  /\bpassword hashing\b/i,
  /\bsession management\b/i,
  /\bnotifications?\b/i,
];

const STORY_PATTERNS = [
  /\bacceptance criteria\b/i,
  /\bimplement\b/i,
  /\bbuild\b/i,
  /\bcreate\b/i,
  /\badd\b/i,
  /\bintegrat(?:e|ion)\b/i,
  /\bworkflow\b/i,
  /\bfeature(?:s)?\b/i,
  /\bdashboard\b/i,
  /\bmanagement\b/i,
  /\bview\b/i,
  /\bassignment\b/i,
  /\bretrospective\b/i,
  /\bvelocity\b/i,
  /\bburndown\b/i,
  /\bperformance optimization\b/i,
  /\bcapacity planning\b/i,
  /\bresource allocation\b/i,
  /\bmobile app\b/i,
  /\bkeyboard shortcuts\b/i,
  /\bslack\b/i,
];

function normalizeLabel(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function extractProjectLabelFromTitle(title: string): string {
  const separatorIndex = title.indexOf(':');
  if (separatorIndex <= 0) {
    return '';
  }

  return normalizeLabel(title.slice(0, separatorIndex));
}

function matchesAnyPattern(value: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(value));
}

function stableHash(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

export function inferSeedIssueType(input: {
  title: string;
  projectTemplateName?: string | null;
}): SeededIssueType {
  const normalizedTitle = normalizeLabel(input.title);
  const normalizedProjectLabel =
    normalizeLabel(input.projectTemplateName) || extractProjectLabelFromTitle(input.title);

  if (matchesAnyPattern(normalizedTitle, SPIKE_PATTERNS)) {
    return 'spike';
  }

  if (matchesAnyPattern(normalizedTitle, CHORE_PATTERNS)) {
    return 'chore';
  }

  if (normalizedProjectLabel.includes('bug')) {
    return 'bug';
  }

  if (matchesAnyPattern(normalizedTitle, BUG_PATTERNS)) {
    return 'bug';
  }

  if (normalizedProjectLabel.includes('core feature')) {
    return 'story';
  }

  if (matchesAnyPattern(normalizedTitle, STORY_PATTERNS)) {
    return 'story';
  }

  const fallbackIndex = stableHash(`${normalizedProjectLabel}:${normalizedTitle}`);
  return WEIGHTED_ISSUE_TYPE_ROTATION[fallbackIndex % WEIGHTED_ISSUE_TYPE_ROTATION.length]!;
}
