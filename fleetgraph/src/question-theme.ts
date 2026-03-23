import type { FleetGraphQuestionTheme } from './types.js';

export function inferFleetGraphQuestionTheme(
  question: string | null | undefined
): FleetGraphQuestionTheme {
  const normalized = question?.trim().toLowerCase() ?? '';

  if (
    normalized.includes('cut') ||
    normalized.includes('defer') ||
    normalized.includes('move out') ||
    normalized.includes('reduce scope') ||
    normalized.includes('drop') ||
    normalized.includes('protect delivery')
  ) {
    return 'scope';
  }

  if (normalized.includes('triage')) {
    return 'status';
  }

  if (
    normalized.includes('impact') ||
    normalized.includes('value') ||
    normalized.includes('roi') ||
    normalized.includes('retention') ||
    normalized.includes('acquisition') ||
    normalized.includes('growth')
  ) {
    return 'impact';
  }

  if (
    normalized.includes('follow-up') ||
    normalized.includes('follow up') ||
    normalized.includes('owner') ||
    normalized.includes('who')
  ) {
    return 'follow_up';
  }

  if (
    normalized.includes('block') ||
    normalized.includes('blocked') ||
    normalized.includes('dependency')
  ) {
    return 'blockers';
  }

  if (
    normalized.includes('capacity') ||
    normalized.includes('overloaded') ||
    normalized.includes('overcommit') ||
    normalized.includes('bandwidth') ||
    normalized.includes('staffing')
  ) {
    return 'capacity';
  }

  if (normalized.includes('scope') || normalized.includes('added') || normalized.includes('change')) {
    return 'scope';
  }

  if (
    normalized.includes('status') ||
    normalized.includes('moving') ||
    normalized.includes('stale') ||
    normalized.includes('stuck') ||
    normalized.includes('triage')
  ) {
    return 'status';
  }

  if (normalized.includes('risk')) {
    return 'risk';
  }

  return 'generic';
}
