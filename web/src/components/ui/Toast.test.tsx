import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider, useToast } from './Toast';

function ToastHarness({ onPersistentAction }: { onPersistentAction?: () => void }) {
  const { showToast } = useToast();

  return (
    <div>
      <button
        onClick={() => showToast('Saved successfully', 'success', 1000)}
        type="button"
      >
        Show timed toast
      </button>
      <button
        onClick={() =>
          showToast(
            'FleetGraph flagged engineering follow-up',
            'info',
            null,
            {
              label: 'Open Issues',
              onClick: onPersistentAction ?? (() => {}),
            },
            {
              persist: true,
              dismissOnAction: false,
            }
          )
        }
        type="button"
      >
        Show sticky toast
      </button>
    </div>
  );
}

describe('ToastProvider', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('crypto', {
      randomUUID: vi.fn(() => 'toast-id'),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('auto-dismisses normal timed toasts', () => {
    render(
      <ToastProvider>
        <ToastHarness />
      </ToastProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Show timed toast' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Saved successfully');

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('keeps sticky FleetGraph toasts open until dismiss even after action clicks', () => {
    const onPersistentAction = vi.fn();

    render(
      <ToastProvider>
        <ToastHarness onPersistentAction={onPersistentAction} />
      </ToastProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Show sticky toast' }));
    expect(screen.getByRole('alert')).toHaveTextContent('FleetGraph flagged engineering follow-up');

    act(() => {
      vi.advanceTimersByTime(20000);
    });

    expect(screen.getByRole('alert')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Open Issues' }));
    expect(onPersistentAction).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('alert')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
