import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/api/client', () => ({
  apiUrl: (path: string) => `http://localhost${path}`,
  apiFetch: vi.fn(),
  useApiToken: vi.fn(),
}));

import { subscribeSyncProgress } from '@/api/sync';
import type { SyncProgress } from '@/api/sync';

// jsdom has no EventSource; a fake is enough to verify the close-on-terminal
// contract (an unclosed source would make the browser auto-reconnect forever
// to a stream that will never resume).
class FakeEventSource {
  static instances: FakeEventSource[] = [];
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  constructor(public url: string) {
    FakeEventSource.instances.push(this);
  }
  close() {
    this.closed = true;
  }
}

function progressEvent(phase: string): { data: string } {
  const progress: SyncProgress = {
    phase,
    step: 0,
    totalSteps: 0,
    percentage: 0,
    description: `phase ${phase}`,
  };
  return { data: JSON.stringify(progress) };
}

beforeEach(() => {
  FakeEventSource.instances = [];
  vi.stubGlobal('EventSource', FakeEventSource);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('subscribeSyncProgress — terminal phases', () => {
  function subscribe() {
    const onProgress = vi.fn();
    const onDone = vi.fn();
    const onError = vi.fn();
    subscribeSyncProgress('run_1', 'sse-token', onProgress, onDone, onError);
    const source = FakeEventSource.instances.at(-1)!;
    return { onProgress, onDone, onError, source };
  }

  it('closes the stream on a restarting event without reporting done or failure', () => {
    const { onProgress, onDone, onError, source } = subscribe();

    source.onmessage!(progressEvent('restarting'));

    // The consumer still sees the event (to show its restart notice)…
    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ phase: 'restarting' }));
    // …but the run is neither finished nor failed: it continues server-side.
    expect(onDone).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    // Closed: no browser auto-reconnect against a restarting server.
    expect(source.closed).toBe(true);
  });

  it('still reports done and error terminally', () => {
    const done = subscribe();
    done.source.onmessage!(progressEvent('done'));
    expect(done.onDone).toHaveBeenCalledOnce();
    expect(done.onError).not.toHaveBeenCalled();
    expect(done.source.closed).toBe(true);

    const failed = subscribe();
    failed.source.onmessage!(progressEvent('error'));
    expect(failed.onError).toHaveBeenCalledWith('phase error');
    expect(failed.onDone).not.toHaveBeenCalled();
    expect(failed.source.closed).toBe(true);
  });

  it('keeps the stream open through non-terminal progress', () => {
    const { onProgress, onDone, onError, source } = subscribe();

    source.onmessage!(progressEvent('syncing'));

    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ phase: 'syncing' }));
    expect(onDone).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expect(source.closed).toBe(false);
  });
});
