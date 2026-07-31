import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { mockUseAutomationRuns, mockDryRunAsync, mockExecuteAsync, mockExecuteReset } = vi.hoisted(
  () => ({
    mockUseAutomationRuns: vi.fn(),
    mockDryRunAsync: vi.fn(),
    mockExecuteAsync: vi.fn(),
    mockExecuteReset: vi.fn(),
  })
);

vi.mock('@/api/automations', () => ({
  useAutomationRuns: mockUseAutomationRuns,
  useStartDryRun: () => ({ mutateAsync: mockDryRunAsync, isPending: false }),
  useExecuteAutomation: () => ({
    mutateAsync: mockExecuteAsync,
    reset: mockExecuteReset,
    isPending: false,
    isSuccess: false,
  }),
}));

import { AutomationsPage } from '@/pages/admin/AutomationsPage';

/** The three automation cards are identical — scope queries to the first one. */
function firstCard() {
  return screen.getAllByRole('button', { name: /Preview Changes/ })[0].closest('div.rounded-xl')!;
}

beforeEach(() => {
  vi.resetAllMocks();
  mockUseAutomationRuns.mockReturnValue({
    data: [],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  });
});

describe('AutomationsPage — action failures', () => {
  it('shows why a preview failed instead of doing nothing', async () => {
    mockDryRunAsync.mockRejectedValue(new Error('auth0 rate limited'));

    render(<AutomationsPage />);
    await userEvent.setup().click(screen.getAllByRole('button', { name: /Preview Changes/ })[0]);

    await waitFor(() => {
      expect(within(firstCard() as HTMLElement).getByRole('alert')).toHaveTextContent(
        /Preview failed: auth0 rate limited/
      );
    });
    expect(screen.getAllByRole('alert')).toHaveLength(1);
  });

  it('shows why an execute failed and keeps the preview on screen', async () => {
    mockDryRunAsync.mockResolvedValue({
      runId: 'run_1',
      type: 'end-of-year',
      academicYear: '2026-2027',
      actions: [{ email: 'a@itatti.harvard.edu', name: 'A Fellow', action: 'remove from role' }],
    });
    mockExecuteAsync.mockRejectedValue(new Error('execution only works in production'));

    const user = userEvent.setup();
    render(<AutomationsPage />);
    await user.click(screen.getAllByRole('button', { name: /Preview Changes/ })[0]);
    await waitFor(() => expect(screen.getByText(/Preview: 1 action/)).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Execute' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        /Execution failed: execution only works in production/
      );
    });
    expect(screen.getByText(/Preview: 1 action/)).toBeInTheDocument();
  });

  it('clears a stale action error on the next preview', async () => {
    mockDryRunAsync.mockRejectedValueOnce(new Error('transient'));
    mockDryRunAsync.mockResolvedValueOnce({
      runId: 'run_2',
      type: 'end-of-year',
      academicYear: '2026-2027',
      actions: [],
    });

    const user = userEvent.setup();
    render(<AutomationsPage />);
    const previewButton = screen.getAllByRole('button', { name: /Preview Changes/ })[0];

    await user.click(previewButton);
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());

    await user.click(previewButton);
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(screen.getByText('No changes needed.')).toBeInTheDocument();
  });
});
