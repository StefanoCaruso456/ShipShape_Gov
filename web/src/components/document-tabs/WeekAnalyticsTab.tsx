import { WeekAnalyticsPanel } from '@/components/week';
import type { DocumentTabProps } from '@/lib/document-tabs';

/**
 * SprintAnalyticsTab - Jira-style sprint analytics surface.
 *
 * Keeps reporting separate from the sprint overview/editor so week delivery
 * signals have a dedicated home.
 */
export default function SprintAnalyticsTab({ documentId }: DocumentTabProps) {
  return (
    <div className="h-full overflow-auto p-4 pb-20">
      <WeekAnalyticsPanel sprintId={documentId} />
    </div>
  );
}
