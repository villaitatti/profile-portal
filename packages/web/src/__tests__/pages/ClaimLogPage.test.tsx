import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { mockUseClaims } = vi.hoisted(() => ({
  mockUseClaims: vi.fn(),
}));

vi.mock('@/api/claims', () => ({
  useClaims: mockUseClaims,
}));

import { ClaimLogPage } from '@/pages/admin/ClaimLogPage';
import type { VitIdClaim } from '@/api/claims';

// Builds the useInfiniteQuery-shaped result the page consumes.
function infiniteResult(
  pages: { claims: VitIdClaim[]; nextCursor: string | null }[] | undefined,
  overrides: Record<string, unknown> = {}
) {
  return {
    data: pages ? { pages, pageParams: pages.map(() => undefined) } : undefined,
    isLoading: false,
    error: null,
    fetchNextPage: vi.fn(),
    hasNextPage: pages ? pages[pages.length - 1].nextCursor != null : false,
    isFetchingNextPage: false,
    ...overrides,
  };
}

function makeClaim(overrides: Partial<VitIdClaim> & { id: string }): VitIdClaim {
  return {
    email: 'someone@example.com',
    firstName: 'Test',
    lastName: 'Person',
    civicrmId: 100,
    hasFellowship: false,
    hasCurrentFellowship: false,
    rolesAssigned: [],
    orgsAssigned: [],
    claimedAt: '2026-04-01T09:00:00.000Z',
    ...overrides,
  };
}

const mockClaims: VitIdClaim[] = [
  makeClaim({
    id: 'claim-1',
    firstName: 'Sophie',
    lastName: 'Laurent',
    email: 'sophie@example.com',
    civicrmId: 11,
    hasFellowship: true,
    hasCurrentFellowship: true,
    rolesAssigned: ['fellows', 'fellows-current'],
    claimedAt: '2026-04-10T07:00:00.000Z',
  }),
  makeClaim({
    id: 'claim-2',
    firstName: 'James',
    lastName: 'Chen',
    email: 'james@example.com',
    civicrmId: 12,
    hasFellowship: true,
    hasCurrentFellowship: false,
    rolesAssigned: ['fellows'],
    claimedAt: '2026-04-08T10:00:00.000Z',
  }),
  makeClaim({
    id: 'claim-3',
    firstName: 'Elena',
    lastName: 'Petrova',
    email: 'elena@example.com',
    civicrmId: 13,
    hasFellowship: false,
    hasCurrentFellowship: false,
    rolesAssigned: [],
    claimedAt: '2026-04-27T14:00:00.000Z',
  }),
];

beforeEach(() => {
  vi.resetAllMocks();
  mockUseClaims.mockReturnValue(infiniteResult([{ claims: mockClaims, nextCursor: null }]));
});

// ─── Loading / Error / Empty ─────────────────────────────────────────────────

describe('ClaimLogPage — loading state', () => {
  it('shows skeleton blocks while loading', () => {
    mockUseClaims.mockReturnValue(infiniteResult(undefined, { isLoading: true }));

    const { container } = render(<ClaimLogPage />);

    expect(container.querySelectorAll('[class*="bg-muted"]').length).toBeGreaterThan(0);
    expect(screen.queryByText('Claim Log')).not.toBeInTheDocument();
  });
});

describe('ClaimLogPage — error state', () => {
  it('shows the failure title and the error message', () => {
    mockUseClaims.mockReturnValue(
      infiniteResult(undefined, { error: new Error('Network exploded') })
    );

    render(<ClaimLogPage />);

    expect(screen.getByText('Failed to load claims')).toBeInTheDocument();
    expect(screen.getByText('Network exploded')).toBeInTheDocument();
  });

  it('falls back to a generic message for non-Error rejections', () => {
    mockUseClaims.mockReturnValue(infiniteResult(undefined, { error: 'boom' }));

    render(<ClaimLogPage />);

    expect(screen.getByText('An unexpected error occurred')).toBeInTheDocument();
  });
});

describe('ClaimLogPage — empty state', () => {
  it('shows "No claims yet" when there are zero claims', () => {
    mockUseClaims.mockReturnValue(infiniteResult([{ claims: [], nextCursor: null }]));

    render(<ClaimLogPage />);

    expect(screen.getByText('No claims yet')).toBeInTheDocument();
    expect(
      screen.getByText('VIT ID claims will appear here as fellows claim their credentials.')
    ).toBeInTheDocument();
    // No search box or table for an empty log.
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});

// ─── Table rendering ─────────────────────────────────────────────────────────

describe('ClaimLogPage — table rendering', () => {
  it('renders one row per claim with names and emails', () => {
    render(<ClaimLogPage />);

    expect(screen.getByText('Sophie Laurent')).toBeInTheDocument();
    expect(screen.getByText('James Chen')).toBeInTheDocument();
    expect(screen.getByText('Elena Petrova')).toBeInTheDocument();
    // Emails render twice (mobile + desktop cells), so use getAllByText.
    expect(screen.getAllByText('sophie@example.com').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/3 total claims/)).toBeInTheDocument();
  });

  it('maps fellowship flags to the Current / Former / No Fellowship badges', () => {
    render(<ClaimLogPage />);

    expect(screen.getByText('Current')).toBeInTheDocument();
    expect(screen.getByText('Former')).toBeInTheDocument();
    expect(screen.getByText('No Fellowship')).toBeInTheDocument();
  });

  it('lists the Auth0 roles assigned at claim time', () => {
    render(<ClaimLogPage />);

    expect(screen.getByText('fellows-current')).toBeInTheDocument();
    // 'fellows' was assigned to two claims.
    expect(screen.getAllByText('fellows').length).toBe(2);
  });
});

// ─── Search ──────────────────────────────────────────────────────────────────

describe('ClaimLogPage — search', () => {
  it('filters rows by name', async () => {
    const user = userEvent.setup();
    render(<ClaimLogPage />);

    await user.type(
      screen.getByRole('textbox', { name: 'Search claims by name or email' }),
      'petrova'
    );

    expect(screen.getByText('Elena Petrova')).toBeInTheDocument();
    expect(screen.queryByText('Sophie Laurent')).not.toBeInTheDocument();
    expect(screen.queryByText('James Chen')).not.toBeInTheDocument();
    expect(screen.getByText(/1 matching/)).toBeInTheDocument();
  });

  it('filters rows by email', async () => {
    const user = userEvent.setup();
    render(<ClaimLogPage />);

    await user.type(
      screen.getByRole('textbox', { name: 'Search claims by name or email' }),
      'james@'
    );

    expect(screen.getByText('James Chen')).toBeInTheDocument();
    expect(screen.queryByText('Elena Petrova')).not.toBeInTheDocument();
  });

  it('shows the no-match message when nothing matches', async () => {
    const user = userEvent.setup();
    render(<ClaimLogPage />);

    await user.type(
      screen.getByRole('textbox', { name: 'Search claims by name or email' }),
      'zzz'
    );

    expect(screen.getByText(/No claims match/)).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});

// ─── Sorting ─────────────────────────────────────────────────────────────────

function bodyRows() {
  return screen.getAllByRole('row').slice(1); // skip the header row
}

describe('ClaimLogPage — sorting', () => {
  it('sorts by claimed date descending by default and exposes aria-sort', () => {
    render(<ClaimLogPage />);

    const claimedAtHeader = screen.getByRole('button', { name: /Claimed At/ }).closest('th');
    expect(claimedAtHeader).toHaveAttribute('aria-sort', 'descending');

    const rows = bodyRows();
    // Desc by claimedAt: Elena (Apr 27) → Sophie (Apr 10) → James (Apr 8)
    expect(within(rows[0]).getByText('Elena Petrova')).toBeInTheDocument();
    expect(within(rows[2]).getByText('James Chen')).toBeInTheDocument();
  });

  it('sorts by name ascending on first click and flips aria-sort on the second', async () => {
    const user = userEvent.setup();
    render(<ClaimLogPage />);

    const nameButton = screen.getByRole('button', { name: /^Name/ });
    await user.click(nameButton);

    let nameHeader = nameButton.closest('th');
    expect(nameHeader).toHaveAttribute('aria-sort', 'ascending');
    // The previously active column loses its aria-sort.
    expect(screen.getByRole('button', { name: /Claimed At/ }).closest('th')).not.toHaveAttribute(
      'aria-sort'
    );

    let rows = bodyRows();
    // Asc by last name: Chen → Laurent → Petrova
    expect(within(rows[0]).getByText('James Chen')).toBeInTheDocument();
    expect(within(rows[2]).getByText('Elena Petrova')).toBeInTheDocument();

    await user.click(nameButton);

    nameHeader = nameButton.closest('th');
    expect(nameHeader).toHaveAttribute('aria-sort', 'descending');
    rows = bodyRows();
    expect(within(rows[0]).getByText('Elena Petrova')).toBeInTheDocument();
    expect(within(rows[2]).getByText('James Chen')).toBeInTheDocument();
  });

  it('ranks fellowship status current > former > none when sorting by status', async () => {
    const user = userEvent.setup();
    render(<ClaimLogPage />);

    // First click on a non-date column sorts ascending: none → former → current.
    await user.click(screen.getByRole('button', { name: /Fellowship Status/ }));

    const rows = bodyRows();
    expect(within(rows[0]).getByText('Elena Petrova')).toBeInTheDocument(); // no fellowship
    expect(within(rows[1]).getByText('James Chen')).toBeInTheDocument(); // former
    expect(within(rows[2]).getByText('Sophie Laurent')).toBeInTheDocument(); // current
  });
});

// ─── Pagination ──────────────────────────────────────────────────────────────

describe('ClaimLogPage — pagination', () => {
  it('shows "Load more" only when there is a next page', () => {
    mockUseClaims.mockReturnValue(
      infiniteResult([{ claims: mockClaims, nextCursor: 'cursor-1' }])
    );

    render(<ClaimLogPage />);

    expect(screen.getByRole('button', { name: 'Load more' })).toBeInTheDocument();
  });

  it('hides "Load more" when the last page has no cursor', () => {
    render(<ClaimLogPage />);

    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
  });

  it('flattens claims across all loaded pages', () => {
    mockUseClaims.mockReturnValue(
      infiniteResult([
        { claims: [mockClaims[0]], nextCursor: 'cursor-1' },
        { claims: [mockClaims[1]], nextCursor: null },
      ])
    );

    render(<ClaimLogPage />);

    expect(screen.getByText('Sophie Laurent')).toBeInTheDocument();
    expect(screen.getByText('James Chen')).toBeInTheDocument();
    expect(screen.getByText(/2 total claims/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
  });

  it('wires "Load more" to fetchNextPage', async () => {
    const result = infiniteResult([{ claims: mockClaims, nextCursor: 'cursor-1' }]);
    mockUseClaims.mockReturnValue(result);

    render(<ClaimLogPage />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Load more' }));

    expect(result.fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it('disables the button and shows the loading label while fetching the next page', () => {
    mockUseClaims.mockReturnValue(
      infiniteResult([{ claims: mockClaims, nextCursor: 'cursor-1' }], {
        isFetchingNextPage: true,
      })
    );

    render(<ClaimLogPage />);

    expect(screen.getByRole('button', { name: 'Loading…' })).toBeDisabled();
  });
});

describe('ClaimLogPage — search/sort over the FULL log', () => {
  it('drains remaining pages automatically while a search query is active', async () => {
    const fetchNextPage = vi.fn();
    mockUseClaims.mockReturnValue(
      infiniteResult([{ claims: mockClaims, nextCursor: 'cursor-2' }], { fetchNextPage })
    );
    render(<ClaimLogPage />);
    expect(fetchNextPage).not.toHaveBeenCalled();

    await userEvent.setup().type(screen.getByRole('textbox'), 'sophie');

    await waitFor(() => expect(fetchNextPage).toHaveBeenCalled());
    // While draining, the provisional state is announced instead of the
    // manual Load more button.
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
    expect(screen.getByText(/Loading older claims/)).toBeInTheDocument();
  });

  it('drains remaining pages when a non-default sort is chosen', async () => {
    const fetchNextPage = vi.fn();
    mockUseClaims.mockReturnValue(
      infiniteResult([{ claims: mockClaims, nextCursor: 'cursor-2' }], { fetchNextPage })
    );
    render(<ClaimLogPage />);

    await userEvent.setup().click(screen.getByRole('button', { name: /Name/ }));

    await waitFor(() => expect(fetchNextPage).toHaveBeenCalled());
  });

  it('shows the loading message, not a false "no match", while searching unloaded pages', async () => {
    mockUseClaims.mockReturnValue(
      infiniteResult([{ claims: mockClaims, nextCursor: 'cursor-2' }], {
        isFetchingNextPage: true,
      })
    );
    render(<ClaimLogPage />);

    await userEvent.setup().type(screen.getByRole('textbox'), 'zzz-no-such-person');

    expect(screen.getAllByText(/Loading older claims/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/No claims match/)).not.toBeInTheDocument();
  });
});
