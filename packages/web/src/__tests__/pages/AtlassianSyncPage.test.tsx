import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import type { SyncProgress } from '@/api/sync';

const {
  mockUseSyncStatus,
  mockUseMappings,
  mockUseSyncRuns,
  mockUseSyncRunDetail,
  mockSubscribeSyncProgress,
  mockFetchSseToken,
  mockStartDryRunMutate,
  mockExecuteMutate,
} = vi.hoisted(() => ({
  mockUseSyncStatus: vi.fn(),
  mockUseMappings: vi.fn(),
  mockUseSyncRuns: vi.fn(),
  mockUseSyncRunDetail: vi.fn(),
  mockSubscribeSyncProgress: vi.fn(),
  mockFetchSseToken: vi.fn(),
  mockStartDryRunMutate: vi.fn(),
  mockExecuteMutate: vi.fn(),
}));

vi.mock('@/api/sync', () => ({
  useSyncStatus: mockUseSyncStatus,
  useMappings: mockUseMappings,
  useSyncRuns: mockUseSyncRuns,
  useSyncRunDetail: mockUseSyncRunDetail,
  useStartDryRun: () => ({ mutate: mockStartDryRunMutate, isPending: false }),
  useExecuteSync: () => ({ mutate: mockExecuteMutate, isPending: false }),
  subscribeSyncProgress: mockSubscribeSyncProgress,
  fetchSseToken: mockFetchSseToken,
}));

vi.mock('@/api/client', () => ({
  useApiToken: () => async () => 'jwt',
}));

import { AtlassianSyncPage } from '@/pages/admin/AtlassianSyncPage';

let queryClient: QueryClient;

function makeWrapper() {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  mockUseSyncStatus.mockReturnValue({ data: { configured: true, devMode: false }, isLoading: false });
  mockUseMappings.mockReturnValue({
    data: [{ id: 'm1', auth0RoleName: 'fellows', atlassianGroupName: 'fellows' }],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    isFetching: false,
  });
  mockUseSyncRuns.mockReturnValue({ data: { runs: [], total: 0, page: 1, perPage: 20 }, isLoading: false });
  mockUseSyncRunDetail.mockReturnValue({ data: undefined });
  mockFetchSseToken.mockResolvedValue('sse-token');
});

describe('AtlassianSyncPage — run failures stay visible', () => {
  it('keeps a failed run on screen after the SSE stream errors', async () => {
    // The failure path clears activeRunId; before the fix that unmounted the
    // panel and the page silently reverted to its pre-run state.
    let raiseError: ((message: string) => void) | undefined;
    mockSubscribeSyncProgress.mockImplementation(
      (
        _runId: string,
        _token: string,
        onProgress: (p: SyncProgress) => void,
        _onDone: () => void,
        onError: (message: string) => void
      ) => {
        onProgress({
          phase: 'syncing',
          step: 3,
          totalSteps: 10,
          percentage: 30,
          description: 'Syncing user 3 of 10',
        });
        raiseError = onError;
        return () => {};
      }
    );
    mockStartDryRunMutate.mockImplementation(
      (_vars: undefined, opts: { onSuccess: (data: { runId: string }) => void }) => {
        opts.onSuccess({ runId: 'run_1' });
      }
    );

    render(<AtlassianSyncPage />, { wrapper: makeWrapper() });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    await userEvent.setup().click(screen.getByRole('button', { name: /Preview Changes/ }));
    await waitFor(() => expect(raiseError).toBeDefined());

    raiseError!('SCIM request failed: 502');

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Preview failed');
    });
    expect(screen.getByRole('alert')).toHaveTextContent('SCIM request failed: 502');
    // Last known step stays on screen for diagnosis.
    expect(screen.getByText('Syncing user 3 of 10')).toBeInTheDocument();
    // History must learn about the failed run.
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['sync-runs'] });
  });

  it('surfaces an sse-token failure instead of silently stopping the button', async () => {
    mockFetchSseToken.mockRejectedValue(new Error('sse-token 401'));

    render(<AtlassianSyncPage />, { wrapper: makeWrapper() });

    await userEvent.setup().click(screen.getByRole('button', { name: /Preview Changes/ }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('sse-token 401');
    });
    expect(mockStartDryRunMutate).not.toHaveBeenCalled();
  });

  it('surfaces a dry-run mutation failure', async () => {
    mockStartDryRunMutate.mockImplementation(
      (_vars: undefined, opts: { onError: (err: Error) => void }) => {
        opts.onError(new Error('dry run rejected'));
      }
    );

    render(<AtlassianSyncPage />, { wrapper: makeWrapper() });

    await userEvent.setup().click(screen.getByRole('button', { name: /Preview Changes/ }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('dry run rejected');
    });
  });

  it('hides the stale preview diff after a failed execute', async () => {
    mockUseSyncRunDetail.mockImplementation((runId: string | null) =>
      runId
        ? {
            data: {
              id: runId,
              status: 'completed',
              completedAt: new Date().toISOString(),
              diff: {
                usersToCreate: [{ email: 'a@itatti.harvard.edu', name: 'A' }],
                usersToUpdate: [],
                usersToDeactivate: [],
                groupsToCreate: [],
                membershipChanges: [],
              },
              result: null,
              stats: null,
            },
          }
        : { data: undefined }
    );
    let raiseError: ((message: string) => void) | undefined;
    mockSubscribeSyncProgress.mockImplementation(
      (
        _runId: string,
        _token: string,
        _onProgress: (p: SyncProgress) => void,
        onDone: () => void,
        onError: (message: string) => void
      ) => {
        raiseError = onError;
        // Dry run completes; execute then fails.
        if (_runId === 'dry_1') onDone();
        return () => {};
      }
    );
    mockStartDryRunMutate.mockImplementation(
      (_vars: undefined, opts: { onSuccess: (data: { runId: string }) => void }) => {
        opts.onSuccess({ runId: 'dry_1' });
      }
    );
    mockExecuteMutate.mockImplementation(
      (_id: string, opts: { onSuccess: (data: { runId: string }) => void }) => {
        opts.onSuccess({ runId: 'exec_1' });
      }
    );

    const user = userEvent.setup();
    render(<AtlassianSyncPage />, { wrapper: makeWrapper() });

    await user.click(screen.getByRole('button', { name: /Preview Changes/ }));
    await waitFor(() => expect(screen.getByText(/Users to Create/)).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /Execute Sync/ }));
    await user.click(screen.getByRole('button', { name: 'Execute Sync' }));
    await waitFor(() => expect(mockExecuteMutate).toHaveBeenCalled());

    raiseError!('SCIM 500');

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Sync failed');
    });
    // The previewed diff described state we can no longer vouch for.
    expect(screen.queryByText(/Users to Create/)).not.toBeInTheDocument();
  });

  it('keeps the preview and does not warn about applied changes when the execute token fetch fails before the run starts', async () => {
    mockUseSyncRunDetail.mockImplementation((runId: string | null) =>
      runId
        ? {
            data: {
              id: runId,
              status: 'completed',
              completedAt: new Date().toISOString(),
              diff: {
                usersToCreate: [{ email: 'a@itatti.harvard.edu', name: 'A' }],
                usersToUpdate: [],
                usersToDeactivate: [],
                groupsToCreate: [],
                membershipChanges: [],
              },
              result: null,
              stats: null,
            },
          }
        : { data: undefined }
    );
    mockSubscribeSyncProgress.mockImplementation(
      (_runId: string, _t: string, _p: (p: SyncProgress) => void, onDone: () => void) => {
        if (_runId === 'dry_1') onDone();
        return () => {};
      }
    );
    mockStartDryRunMutate.mockImplementation(
      (_vars: undefined, opts: { onSuccess: (d: { runId: string }) => void }) => {
        opts.onSuccess({ runId: 'dry_1' });
      }
    );
    // Preview gets its token; the execute attempt's token fetch then fails
    // BEFORE the execute mutation runs.
    mockFetchSseToken.mockResolvedValueOnce('sse-token');
    mockFetchSseToken.mockRejectedValueOnce(new Error('sse-token 401'));

    const user = userEvent.setup();
    render(<AtlassianSyncPage />, { wrapper: makeWrapper() });

    await user.click(screen.getByRole('button', { name: /Preview Changes/ }));
    await waitFor(() => expect(screen.getByText(/Users to Create/)).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /Execute Sync/ }));
    await user.click(screen.getByRole('button', { name: 'Execute Sync' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent("Couldn't start sync");
    });
    // The execute mutation must never have run, and the preview must survive so
    // the operator can retry against the same (still-valid) diff.
    expect(mockExecuteMutate).not.toHaveBeenCalled();
    expect(screen.getByText(/Users to Create/)).toBeInTheDocument();
    // Must NOT claim changes may have landed — nothing started.
    expect(screen.queryByText(/may already have been applied/)).not.toBeInTheDocument();
  });
});

describe('AtlassianSyncPage — mappings query failure', () => {
  it('disables the dry run and explains why when mappings cannot be loaded', () => {
    mockUseMappings.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('mappings 500'),
      refetch: vi.fn(),
      isFetching: false,
    });

    render(<AtlassianSyncPage />, { wrapper: makeWrapper() });

    expect(screen.getByRole('button', { name: /Preview Changes/ })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent(/Couldn't load the group mappings/);
  });
});
