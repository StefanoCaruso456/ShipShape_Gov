import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAutoSave } from './useAutoSave';

describe('useAutoSave', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('abandons stale in-flight values and reports the latest pending value', async () => {
    let rejectFirst: ((reason?: unknown) => void) | undefined;
    const latestError = new Error('latest save failed');
    const onSave = vi.fn()
      .mockImplementationOnce(() => new Promise((_, reject) => {
        rejectFirst = reject;
      }))
      .mockRejectedValue(latestError);
    const onError = vi.fn();

    const { result } = renderHook(() => useAutoSave({
      onSave,
      onError,
      throttleMs: 0,
      maxRetries: 0,
    }));

    await act(async () => {
      result.current('F');
      await Promise.resolve();
    });

    await act(async () => {
      result.current('FailTitle');
      await Promise.resolve();
    });

    await act(async () => {
      rejectFirst?.(new Error('first save failed'));
      await Promise.resolve();
    });

    expect(onSave).toHaveBeenNthCalledWith(1, 'F');
    expect(onSave).toHaveBeenNthCalledWith(2, 'FailTitle');
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith('FailTitle', latestError);
  });

});
