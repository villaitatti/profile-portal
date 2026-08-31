import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import type { FellowDashboardEntry } from '@itatti/shared';

const { mockUseFellowsDashboard } = vi.hoisted(() => ({
  mockUseFellowsDashboard: vi.fn(),
}));

vi.mock('@/api/fellows', () => ({
  useFellowsDashboard: mockUseFellowsDashboard,
}));

// The table has its own dependencies (email hooks, dialogs); this suite covers
// the page-level filters, so a name-only stub keeps the surface minimal.
vi.mock('@/pages/admin/fellows/FellowsTable', () => ({
  FellowsTable: ({ fellows }: { fellows: FellowDashboardEntry[] }) => (
    <div data-testid="fellows-table">
      {fellows.map((f) => (
        <div key={f.civicrmId}>
          {f.firstName} {f.lastName}
        </div>
      ))}
    </div>
  ),
}));

import { FellowsManagementPage } from '@/pages/admin/FellowsManagementPage';

function makeFellow(
  overrides: Partial<FellowDashboardEntry> & { civicrmId: number }
): FellowDashboardEntry {
  return {
    firstName: 'Test',
    lastName: 'Fellow',
    email: 'test@example.com',
    fellowshipYear: '2025-2026',
    fellowshipId: overrides.civicrmId,
    status: 'active',
    civicrmIdStatus: 'ok',
    bioEmail: {
      status: 'none',
      sentAt: null,
      sendCount: 0,
      targetAcademicYear: null,
      canManuallySend: false,
    },
    vitIdInvitation: {
      status: 'none',
      sentAt: null,
      sendCount: 0,
      targetAcademicYear: null,
      canManuallySend: false,
    },
    appointeeStatus: 'enrolled',
    formInvitations: [],
    ...overrides,
  };
}

const mockFellows: FellowDashboardEntry[] = [
  makeFellow({
    civicrmId: 1,
    firstName: 'Sophie',
    lastName: 'Laurent',
    email: 'sophie@example.com',
    appointmentCategory: 'term-fellow',
    appointeeStatus: 'enrolled',
    status: 'active',
  }),
  makeFellow({
    civicrmId: 2,
    firstName: 'James',
    lastName: 'Chen',
    email: 'james@example.com',
    appointmentCategory: 'full-year-fellow',
    appointeeStatus: 'nominated',
    status: 'no-account',
  }),
  makeFellow({
    civicrmId: 3,
    firstName: 'Elena',
    lastName: 'Petrova',
    email: 'elena@example.com',
    appointmentCategory: 'visiting-professor',
    appointeeStatus: 'accepted',
    status: 'needs-review',
  }),
];

function makeWrapper(initialPath = '/admin/fellows') {
  return ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[initialPath]}>{children}</MemoryRouter>
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  mockUseFellowsDashboard.mockReturnValue({
    data: {
      fellows: mockFellows,
      academicYears: ['2025-2026', '2024-2025'],
      summary: { total: mockFellows.length },
    },
    isLoading: false,
    error: null,
  });
});

describe('FellowsManagementPage — defaults', () => {
  it('shows all fellows with no URL params', () => {
    const Wrapper = makeWrapper();
    render(
      <Wrapper>
        <FellowsManagementPage />
      </Wrapper>
    );

    expect(screen.getByText('Sophie Laurent')).toBeInTheDocument();
    expect(screen.getByText('James Chen')).toBeInTheDocument();
    expect(screen.getByText('Elena Petrova')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^All/ })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('gives the search input an accessible label', () => {
    const Wrapper = makeWrapper();
    render(
      <Wrapper>
        <FellowsManagementPage />
      </Wrapper>
    );

    expect(
      screen.getByRole('textbox', { name: 'Search by name or email...' })
    ).toBeInTheDocument();
  });
});

describe('FellowsManagementPage — URL filter state', () => {
  it('initializes the appointment tab from ?tab=', () => {
    const Wrapper = makeWrapper('/admin/fellows?tab=term-fellow');
    render(
      <Wrapper>
        <FellowsManagementPage />
      </Wrapper>
    );

    expect(screen.getByRole('button', { name: /Term Fellows/ })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByText('Sophie Laurent')).toBeInTheDocument();
    expect(screen.queryByText('James Chen')).not.toBeInTheDocument();
  });

  it('initializes appointee-status pills from ?status=', () => {
    const Wrapper = makeWrapper('/admin/fellows?status=nominated,accepted');
    render(
      <Wrapper>
        <FellowsManagementPage />
      </Wrapper>
    );

    expect(screen.getByRole('button', { name: /Nominated/ })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByText('James Chen')).toBeInTheDocument();
    expect(screen.getByText('Elena Petrova')).toBeInTheDocument();
    expect(screen.queryByText('Sophie Laurent')).not.toBeInTheDocument();
  });

  it('initializes VIT ID pills from ?vitId=', () => {
    const Wrapper = makeWrapper('/admin/fellows?vitId=no-account');
    render(
      <Wrapper>
        <FellowsManagementPage />
      </Wrapper>
    );

    expect(screen.getByText('James Chen')).toBeInTheDocument();
    expect(screen.queryByText('Sophie Laurent')).not.toBeInTheDocument();
    expect(screen.queryByText('Elena Petrova')).not.toBeInTheDocument();
  });

  it('initializes the search query from ?q=', () => {
    const Wrapper = makeWrapper('/admin/fellows?q=sophie');
    render(
      <Wrapper>
        <FellowsManagementPage />
      </Wrapper>
    );

    expect(
      screen.getByRole('textbox', { name: 'Search by name or email...' })
    ).toHaveValue('sophie');
    expect(screen.getByText('Sophie Laurent')).toBeInTheDocument();
    expect(screen.queryByText('James Chen')).not.toBeInTheDocument();
  });

  it('ignores invalid tab/status/vitId values in the URL', () => {
    const Wrapper = makeWrapper(
      '/admin/fellows?tab=bogus&status=not-a-status&vitId=nope'
    );
    render(
      <Wrapper>
        <FellowsManagementPage />
      </Wrapper>
    );

    expect(screen.getByRole('button', { name: /^All/ })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByText('Sophie Laurent')).toBeInTheDocument();
    expect(screen.getByText('James Chen')).toBeInTheDocument();
    expect(screen.getByText('Elena Petrova')).toBeInTheDocument();
  });

  it('filters after typing in the search box (debounced into the URL)', async () => {
    const user = userEvent.setup();
    const Wrapper = makeWrapper();
    render(
      <Wrapper>
        <FellowsManagementPage />
      </Wrapper>
    );

    await user.type(
      screen.getByRole('textbox', { name: 'Search by name or email...' }),
      'petrova'
    );

    await waitFor(() => {
      expect(screen.queryByText('Sophie Laurent')).not.toBeInTheDocument();
    });
    expect(screen.getByText('Elena Petrova')).toBeInTheDocument();
  });

  it('switching tab resets the status filters', async () => {
    const user = userEvent.setup();
    const Wrapper = makeWrapper('/admin/fellows?status=enrolled');
    render(
      <Wrapper>
        <FellowsManagementPage />
      </Wrapper>
    );

    expect(screen.queryByText('James Chen')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Full Year Fellows/ }));

    expect(screen.getByText('James Chen')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Enrolled/ })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
  });
});
