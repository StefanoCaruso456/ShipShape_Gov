import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, act } from '@testing-library/react';
import { KanbanBoard } from './KanbanBoard';

const dndState = vi.hoisted(() => ({
  onDragEnd: null as ((event: { active: { id: string }; over: { id: string } | null }) => void) | null,
}));

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children, onDragEnd }: { children: React.ReactNode; onDragEnd: typeof dndState.onDragEnd }) => {
    dndState.onDragEnd = onDragEnd;
    return <div data-testid="dnd-context">{children}</div>;
  },
  DragOverlay: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  pointerWithin: vi.fn(),
  PointerSensor: class PointerSensor {},
  KeyboardSensor: class KeyboardSensor {},
  useSensor: vi.fn((sensor: unknown, options?: unknown) => ({ sensor, options })),
  useSensors: vi.fn((...sensors: unknown[]) => sensors),
  useDroppable: vi.fn(() => ({ setNodeRef: vi.fn(), isOver: false })),
}));

vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  sortableKeyboardCoordinates: vi.fn(),
  verticalListSortingStrategy: {},
  useSortable: vi.fn(({ id }: { id: string }) => ({
    attributes: { 'data-sortable-id': id },
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: null,
    isDragging: false,
  })),
}));

vi.mock('@dnd-kit/utilities', () => ({
  CSS: {
    Transform: {
      toString: () => '',
    },
  },
}));

vi.mock('@/components/ui/Tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe('KanbanBoard', () => {
  beforeEach(() => {
    dndState.onDragEnd = null;
  });

  it('updates the issue state when a card is dropped into a new column', async () => {
    // critical-path: sprint-board-drag-drop
    // Risk mitigated: if board drop-target resolution changes, sprint planning can stop persisting issue moves even though the drag interaction still appears to work.
    const onUpdateIssue = vi.fn().mockResolvedValue(undefined);

    render(
      <KanbanBoard
        issues={[
          {
            id: 'issue-1',
            title: 'Backlog issue',
            state: 'backlog',
            priority: 'medium',
            ticket_number: 101,
            assignee_name: null,
          },
        ]}
        onUpdateIssue={onUpdateIssue}
        onIssueClick={vi.fn()}
      />
    );

    act(() => {
      dndState.onDragEnd?.({
        active: { id: 'issue-1' },
        over: { id: 'todo' },
      });
    });

    expect(onUpdateIssue).toHaveBeenCalledWith('issue-1', { state: 'todo' });
  });

  it('resolves the target state when dropped on another issue card', async () => {
    const onUpdateIssue = vi.fn().mockResolvedValue(undefined);

    render(
      <KanbanBoard
        issues={[
          {
            id: 'issue-1',
            title: 'Backlog issue',
            state: 'backlog',
            priority: 'medium',
            ticket_number: 101,
            assignee_name: null,
          },
          {
            id: 'issue-2',
            title: 'Todo issue',
            state: 'todo',
            priority: 'medium',
            ticket_number: 102,
            assignee_name: null,
          },
        ]}
        onUpdateIssue={onUpdateIssue}
        onIssueClick={vi.fn()}
      />
    );

    act(() => {
      dndState.onDragEnd?.({
        active: { id: 'issue-1' },
        over: { id: 'issue-2' },
      });
    });

    expect(onUpdateIssue).toHaveBeenCalledWith('issue-1', { state: 'todo' });
  });
});
