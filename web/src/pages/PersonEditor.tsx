import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { WORK_PERSONA_LABELS, WORK_PERSONAS, type WorkPersona } from '@ship/shared';
import { Editor } from '@/components/Editor';
import { useAuth } from '@/hooks/useAuth';
import { useDocuments } from '@/contexts/DocumentsContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useAutoSave } from '@/hooks/useAutoSave';
import { useAssignableMembersQuery } from '@/hooks/useTeamMembersQuery';
import { PersonCombobox, type Person } from '@/components/PersonCombobox';
import { PropertyRow } from '@/components/ui/PropertyRow';
import { apiGet, apiPatch, apiDelete } from '@/lib/api';

interface PersonDocument {
  id: string;
  title: string;
  content: unknown;
  document_type: string;
  archived_at: string | null;
  properties?: {
    email?: string | null;
    role?: string | null;
    work_persona?: WorkPersona | null;
    reports_to?: string | null;
    user_id?: string | null;
    [key: string]: unknown;
  };
}

interface SprintMetric {
  committed: number;
  completed: number;
}

interface SprintInfo {
  number: number;
  name: string;
  isCurrent: boolean;
}

interface SprintMetricsResponse {
  sprints: SprintInfo[];
  metrics: Record<number, SprintMetric>;
  averageRate: number;
}

export function PersonEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { createDocument } = useDocuments();
  const { isWorkspaceAdmin } = useWorkspace();
  const { data: teamMembers } = useAssignableMembersQuery();
  const [person, setPerson] = useState<PersonDocument | null>(null);
  const [loading, setLoading] = useState(true);

  // Create sub-document (for slash commands) - creates a wiki doc linked to this person
  const handleCreateSubDocument = useCallback(async () => {
    if (!id) return null;
    const newDoc = await createDocument(id);
    if (newDoc) {
      return { id: newDoc.id, title: newDoc.title };
    }
    return null;
  }, [createDocument, id]);

  // Navigate to document (for slash commands and mentions)
  const handleNavigateToDocument = useCallback((docId: string) => {
    navigate(`/documents/${docId}`);
  }, [navigate]);
  const [sprintMetrics, setSprintMetrics] = useState<SprintMetricsResponse | null>(null);
  const [metricsVisible, setMetricsVisible] = useState(false);

  useEffect(() => {
    async function fetchPerson() {
      if (!id) return;
      try {
        const response = await apiGet(`/api/documents/${id}`);
        if (response.ok) {
          const data = await response.json();
          if (data.document_type === 'person') {
            setPerson(data);
          } else {
            // Not a person document, redirect to directory
            navigate('/team/directory');
          }
        } else {
          navigate('/team/directory');
        }
      } catch (error) {
        console.error('Failed to fetch person:', error);
        navigate('/team/directory');
      } finally {
        setLoading(false);
      }
    }
    fetchPerson();
  }, [id, navigate]);

  // Fetch sprint metrics (only visible to self or admins)
  useEffect(() => {
    async function fetchSprintMetrics() {
      if (!id) return;
      try {
        const response = await apiGet(`/api/team/people/${id}/sprint-metrics`);
        if (response.ok) {
          const data = await response.json();
          setSprintMetrics(data);
          setMetricsVisible(true);
        } else if (response.status === 403) {
          // User not authorized to see metrics - that's fine
          setMetricsVisible(false);
        }
      } catch (error) {
        console.error('Failed to fetch sprint metrics:', error);
      }
    }
    fetchSprintMetrics();
  }, [id]);

  // Throttled title save with stale response handling
  const throttledTitleSave = useAutoSave({
    onSave: async (newTitle: string) => {
      if (!id) return;
      const title = newTitle || 'Untitled';
      await apiPatch(`/api/documents/${id}`, { title });
    },
  });

  const handleDelete = useCallback(async () => {
    if (!id || !confirm('Delete this person? This cannot be undone.')) return;

    try {
      const response = await apiDelete(`/api/documents/${id}`);
      if (response.ok) {
        navigate('/team/directory');
      }
    } catch (error) {
      console.error('Failed to delete person:', error);
    }
  }, [id, navigate]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-muted">Loading...</div>
      </div>
    );
  }

  if (!person || !id) {
    return null;
  }

  return (
    <Editor
      documentId={id}
      userName={user?.name || 'Anonymous'}
      initialTitle={person.title}
      onTitleChange={throttledTitleSave}
      onBack={() => navigate('/team/directory')}
      backLabel="Team Directory"
      roomPrefix="person"
      placeholder="Add bio, contact info, skills..."
      onDelete={handleDelete}
      onCreateSubDocument={handleCreateSubDocument}
      onNavigateToDocument={handleNavigateToDocument}
      sidebar={
        <PersonSidebar
          person={person}
          people={teamMembers || []}
          isAdmin={isWorkspaceAdmin}
          onUpdateProperties={async (updates) => {
            await apiPatch(`/api/documents/${id}`, { properties: updates });
            setPerson(prev => prev ? { ...prev, properties: { ...prev.properties, ...updates } } : prev);
          }}
          metricsVisible={metricsVisible}
          sprintMetrics={sprintMetrics}
          currentUserId={user?.id ?? null}
        />
      }
    />
  );
}

interface PersonSidebarProps {
  person: PersonDocument;
  people: { id: string; user_id: string | null; name: string; email?: string; workPersona?: WorkPersona | null }[];
  isAdmin: boolean;
  currentUserId: string | null;
  onUpdateProperties: (updates: Record<string, unknown>) => Promise<void>;
  metricsVisible: boolean;
  sprintMetrics: SprintMetricsResponse | null;
}

function PersonSidebar({
  person,
  people,
  isAdmin,
  currentUserId,
  onUpdateProperties,
  metricsVisible,
  sprintMetrics,
}: PersonSidebarProps) {
  const props = person.properties || {};
  const reportsTo = (props.reports_to as string) || null;
  const personUserId = (props.user_id as string) || null;
  const linkedPerson = people.find((entry) => entry.id === person.id || entry.user_id === personUserId);
  const workPersona = ((props.work_persona as WorkPersona | null | undefined) ?? linkedPerson?.workPersona) ?? null;
  const canEditWorkPersona = isAdmin || (personUserId !== null && personUserId === currentUserId);
  const [roleDraft, setRoleDraft] = useState(typeof props.role === 'string' ? props.role : '');
  const [isSavingRole, setIsSavingRole] = useState(false);

  useEffect(() => {
    setRoleDraft(typeof props.role === 'string' ? props.role : '');
  }, [props.role]);

  // Build people list for combobox, excluding the current person
  const comboboxPeople: Person[] = people
    .filter((p): p is typeof p & { user_id: string } => typeof p.user_id === 'string' && p.user_id !== personUserId)
    .map(p => ({ id: p.id, user_id: p.user_id, name: p.name, email: p.email || '' }));

  // Find supervisor name for read-only display
  const supervisor = reportsTo ? people.find(p => p.user_id === reportsTo) : null;

  const saveRole = useCallback(async () => {
    const normalizedRole = roleDraft.trim() || null;
    const currentRole =
      typeof props.role === 'string' && props.role.trim().length > 0
        ? props.role.trim()
        : null;

    if (normalizedRole === currentRole) {
      setRoleDraft(normalizedRole ?? '');
      return;
    }

    setIsSavingRole(true);
    try {
      await onUpdateProperties({ role: normalizedRole });
      setRoleDraft(normalizedRole ?? '');
    } finally {
      setIsSavingRole(false);
    }
  }, [onUpdateProperties, props.role, roleDraft]);

  return (
    <div className="space-y-4 p-4">
      {person.archived_at && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
          <p className="text-sm font-medium text-amber-300">Archived</p>
          <p className="mt-1 text-xs text-amber-300/70">
            This team member has been archived and no longer has access.
          </p>
        </div>
      )}

      <PropertyRow label="Email">
        <div className="text-sm text-foreground">
          {props.email || <span className="text-muted">Not set</span>}
        </div>
      </PropertyRow>

      <PropertyRow label="Work Persona" tooltip="Persona FleetGraph uses for role-aware prompts and notifications">
        {canEditWorkPersona ? (
          <select
            className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm text-foreground outline-none focus:border-ring"
            value={workPersona ?? ''}
            onChange={(event) =>
              onUpdateProperties({
                work_persona: event.target.value ? event.target.value : null,
              })
            }
          >
            <option value="">Not set</option>
            {WORK_PERSONAS.map((persona) => (
              <option key={persona} value={persona}>
                {WORK_PERSONA_LABELS[persona]}
              </option>
            ))}
          </select>
        ) : (
          <div className="text-sm text-foreground">
            {workPersona ? WORK_PERSONA_LABELS[workPersona] : <span className="text-muted">Not set</span>}
          </div>
        )}
      </PropertyRow>

      <PropertyRow label="Role" tooltip="Job title or functional role for this person">
        <input
          type="text"
          value={roleDraft}
          onChange={(event) => setRoleDraft(event.target.value)}
          onBlur={() => {
            void saveRole();
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              event.currentTarget.blur();
            }

            if (event.key === 'Escape') {
              setRoleDraft(typeof props.role === 'string' ? props.role : '');
              event.currentTarget.blur();
            }
          }}
          placeholder="Add role..."
          aria-label="Role"
          disabled={isSavingRole}
          className="w-full rounded bg-border px-2 py-1 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent disabled:cursor-wait disabled:opacity-60"
        />
      </PropertyRow>

      <PropertyRow label="Reports To" tooltip="Official supervisor — determines performance evaluation authority">
        {isAdmin ? (
          <PersonCombobox
            people={comboboxPeople}
            value={reportsTo}
            onChange={(value) => onUpdateProperties({ reports_to: value })}
            placeholder="Select supervisor..."
          />
        ) : (
          <div className="text-sm text-foreground">
            {supervisor ? supervisor.name : <span className="text-muted">Not set</span>}
          </div>
        )}
      </PropertyRow>

      {metricsVisible && sprintMetrics && (
        <SprintHistory metrics={sprintMetrics} />
      )}
    </div>
  );
}

function SprintHistory({ metrics }: { metrics: SprintMetricsResponse }) {
  const { sprints, metrics: sprintMetrics, averageRate } = metrics;

  // Calculate completion rates for each sprint
  const rates = sprints.map(sprint => {
    const m = sprintMetrics[sprint.number];
    if (!m || m.committed === 0) return null;
    return Math.round((m.completed / m.committed) * 100);
  });

  // Find max rate for scaling the trend line
  const validRates = rates.filter((r): r is number => r !== null);
  const maxRate = Math.max(...validRates, 100);

  return (
    <div className="mt-6 border-t border-border pt-4">
      <label className="mb-3 block text-xs font-medium text-muted">Week History</label>

      {/* Trend line SVG */}
      <div className="mb-3">
        <svg viewBox="0 0 200 60" className="h-12 w-full">
          {/* Background grid */}
          <line x1="0" y1="30" x2="200" y2="30" stroke="currentColor" strokeOpacity="0.1" />
          <line x1="0" y1="15" x2="200" y2="15" stroke="currentColor" strokeOpacity="0.05" />
          <line x1="0" y1="45" x2="200" y2="45" stroke="currentColor" strokeOpacity="0.05" />

          {/* 60% threshold line */}
          <line
            x1="0"
            y1={60 - (60 / maxRate) * 60}
            x2="200"
            y2={60 - (60 / maxRate) * 60}
            stroke="#f97316"
            strokeOpacity="0.3"
            strokeDasharray="4"
          />

          {/* Trend line */}
          {validRates.length > 1 && (
            <polyline
              fill="none"
              stroke="#8b5cf6"
              strokeWidth="2"
              points={rates
                .map((rate, i) => {
                  if (rate === null) return null;
                  const x = (i / (sprints.length - 1)) * 180 + 10;
                  const y = 55 - (rate / maxRate) * 50;
                  return `${x},${y}`;
                })
                .filter(Boolean)
                .join(' ')}
            />
          )}

          {/* Data points */}
          {rates.map((rate, i) => {
            if (rate === null) return null;
            const x = (i / Math.max(sprints.length - 1, 1)) * 180 + 10;
            const y = 55 - (rate / maxRate) * 50;
            const isLow = rate < 60;
            return (
              <circle
                key={i}
                cx={x}
                cy={y}
                r="4"
                fill={isLow ? '#f97316' : '#8b5cf6'}
              />
            );
          })}
        </svg>
      </div>

      {/* Sprint metrics list */}
      <div className="space-y-1">
        {sprints.map(sprint => {
          const m = sprintMetrics[sprint.number];
          const committed = m?.committed || 0;
          const completed = m?.completed || 0;
          const rate = committed > 0 ? Math.round((completed / committed) * 100) : null;
          const isLow = rate !== null && rate < 60;

          return (
            <div
              key={sprint.number}
              className={`flex items-center justify-between text-xs ${
                sprint.isCurrent ? 'font-medium' : ''
              }`}
            >
              <span className="text-muted">
                {sprint.name}
                {sprint.isCurrent && ' (current)'}
              </span>
              <span className={isLow ? 'text-orange-500' : 'text-foreground'}>
                {committed > 0 ? `${completed}/${committed}h (${rate}%)` : '—'}
              </span>
            </div>
          );
        })}
      </div>

      {/* Average */}
      <div className="mt-3 flex items-center justify-between border-t border-border pt-2 text-xs">
        <span className="font-medium text-muted">Average</span>
        <span className={`font-medium ${averageRate < 60 ? 'text-orange-500' : 'text-foreground'}`}>
          {averageRate}%
        </span>
      </div>
    </div>
  );
}
