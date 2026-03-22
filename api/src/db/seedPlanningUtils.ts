import type pg from 'pg';
import { deriveStoryPointsFromEstimateHours } from '../utils/sprint-planning.js';

function parseNumeric(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

export function buildIssuePlanningProperties(estimateHours: number): {
  estimate_hours: number;
  estimate: number;
  story_points: number | null;
} {
  const normalizedEstimate = Math.max(Math.round(estimateHours * 10) / 10, 0);

  return {
    estimate_hours: normalizedEstimate,
    estimate: normalizedEstimate,
    story_points: deriveStoryPointsFromEstimateHours(normalizedEstimate),
  };
}

export async function ensureIssuePlanningProperties(
  pool: pg.Pool,
  issueId: string,
  properties: Record<string, unknown> | null | undefined,
  estimateHours: number
): Promise<void> {
  const currentEstimateHours = parseNumeric(properties?.estimate_hours ?? properties?.estimate);
  const currentStoryPoints = parseNumeric(properties?.story_points);
  const nextPlanning = buildIssuePlanningProperties(estimateHours);

  if (
    currentEstimateHours === nextPlanning.estimate_hours &&
    currentStoryPoints === nextPlanning.story_points
  ) {
    return;
  }

  await pool.query(
    `UPDATE documents
     SET properties = $1,
         updated_at = NOW()
     WHERE id = $2`,
    [
      JSON.stringify({
        ...(properties ?? {}),
        estimate_hours: nextPlanning.estimate_hours,
        estimate: nextPlanning.estimate,
        story_points: nextPlanning.story_points,
      }),
      issueId,
    ]
  );
}
