import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import type { ReactNode } from 'react';

// Hoisted mocks for the hooks
const { mockUseEmailEvents, mockUseEmailEventPreview, mockUseTemplatePreview } = vi.hoisted(
  () => ({
    mockUseEmailEvents: vi.fn(),
    mockUseEmailEventPreview: vi.fn(),
    mockUseTemplatePreview: vi.fn(),
  })
);

vi.mock('@/api/emails', () => ({
  useEmailEvents: mockUseEmailEvents,
  useEmailEventPreview: mockUseEmailEventPreview,
  useTemplatePreview: mockUseTemplatePreview,
}));

import { EmailsPage } from '@/pages/admin/EmailsPage';
import type { EmailEvent, EmailEventsResponse } from '@/api/emails';

// Builds the useInfiniteQuery-shaped result the page consumes.
function infiniteResult(
  pages: EmailEventsResponse[] | undefined,
  overrides: Record<string, unknown> = {}
) {
  return {
    data: pages ? { pages, pageParams: pages.map((_, i) => (i === 0 ? undefined : `c${i}`)) } : undefined,
    isLoading: false,
    error: null,
    fetchNextPage: vi.fn(),
    hasNextPage: pages ? pages[pages.length - 1].nextCursor != null : false,
    isFetchingNextPage: false,
    isFetchNextPageError: false,
    ...overrides,
  };
}

// The page persists its filters/sort in the URL, so it needs a router.
function makeWrapper(initialPath = '/admin/emails') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialPath]}>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

const mockEvents: EmailEvent[] = [
  {
    id: 'evt-1',
    fellowshipId: 101,
    contactId: 3,
    appointeeName: 'Sophie Laurent',
    academicYear: '2025-2026',
    emailType: 'BIO_PROJECT_DESCRIPTION',
    status: 'SENT',
    enqueuedAt: '2026-04-10T07:00:00.000Z',
    sentAt: '2026-04-11T09:00:00.000Z',
    updatedAt: '2026-04-11T09:00:00.000Z',
    triggeredBy: 'claim_auto',
    failureReason: null,
    sesMessageId: 'ses-123',
  },
  {
    id: 'evt-2',
    fellowshipId: 102,
    contactId: 5,
    appointeeName: 'James Chen',
    academicYear: '2025-2026',
    emailType: 'VIT_ID_INVITATION',
    status: 'FAILED',
    enqueuedAt: '2026-04-08T10:00:00.000Z',
    sentAt: null,
    updatedAt: '2026-04-09T10:00:00.000Z',
    triggeredBy: 'admin_manual:auth0|andrea123:Andrea Caselli',
    failureReason: 'SES rejected: Email address is not verified.',
    sesMessageId: null,
  },
  {
    id: 'evt-3',
    fellowshipId: 103,
    contactId: 6,
    appointeeName: 'Elena Petrova',
    academicYear: '2024-2025',
    emailType: 'BIO_PROJECT_DESCRIPTION',
    status: 'PENDING',
    enqueuedAt: '2026-04-27T14:00:00.000Z',
    sentAt: null,
    updatedAt: '2026-04-27T14:00:00.000Z',
    triggeredBy: 'admin_manual:auth0|legacy999',
    failureReason: null,
    sesMessageId: null,
  },
];

const stableResponses = new Map<string, { events: EmailEvent[]; nextCursor: null }>();
function getStableResponse(params: Record<string, string | number | undefined>) {
  const key = JSON.stringify(params);
  if (!stableResponses.has(key)) {
    let filtered = mockEvents;
    if (params.year) filtered = filtered.filter((e) => e.academicYear === params.year);
    if (params.type) filtered = filtered.filter((e) => e.emailType === params.type);
    if (params.status) {
      const statuses = String(params.status).split(',');
      filtered = filtered.filter((e) => statuses.includes(e.status));
    }
    stableResponses.set(key, { events: filtered, nextCursor: null });
  }
  return stableResponses.get(key)!;
}

const stableResults = new Map<string, ReturnType<typeof infiniteResult>>();

function setDefaultHookStates() {
  stableResponses.clear();
  stableResults.clear();
  mockUseEmailEvents.mockImplementation((params: Record<string, string | number | undefined> = {}) => {
    const key = JSON.stringify(params);
    if (!stableResults.has(key)) {
      stableResults.set(key, infiniteResult([getStableResponse(params)]));
    }
    return stableResults.get(key)!;
  });
  mockUseEmailEventPreview.mockReturnValue({
    data: null,
    isLoading: false,
    error: null,
  });
  mockUseTemplatePreview.mockReturnValue({
    data: null,
    isLoading: false,
    error: null,
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  setDefaultHookStates();
});

// ─── Page Structure ──────────────────────────────────────────────────────────

describe('EmailsPage — structure', () => {
  it('renders the page header with title and description', () => {
    const Wrapper = makeWrapper();
    render(
      <Wrapper>
        <EmailsPage />
      </Wrapper>
    );
    expect(screen.getByText('Emails')).toBeInTheDocument();
    expect(screen.getByText(/Audit trail of sent emails/i)).toBeInTheDocument();
  });

  it('renders three tabs: Sent emails, Templates, How emails work', () => {
    const Wrapper = makeWrapper();
    render(
      <Wrapper>
        <EmailsPage />
      </Wrapper>
    );
    expect(screen.getByRole('tab', { name: 'Sent emails' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Templates' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'How emails work' })).toBeInTheDocument();
  });
});

// ─── Sent Emails Tab — Loading ───────────────────────────────────────────────

describe('EmailsPage — Sent emails tab — loading state', () => {
  it('shows skeleton blocks while loading', () => {
    mockUseEmailEvents.mockReturnValue(infiniteResult(undefined, { isLoading: true }));
    const Wrapper = makeWrapper();
    const { container } = render(
      <Wrapper>
        <EmailsPage />
      </Wrapper>
    );
    // SkeletonBlock renders divs with bg-muted class
    expect(container.querySelectorAll('[class*="bg-muted"]').length).toBeGreaterThan(0);
  });
});

// ─── Sent Emails Tab — Error ─────────────────────────────────────────────────

describe('EmailsPage — Sent emails tab — error state', () => {
  it('shows error message when loading fails', () => {
    mockUseEmailEvents.mockReturnValue(
      infiniteResult(undefined, { error: new Error('Network error') })
    );
    const Wrapper = makeWrapper();
    render(
      <Wrapper>
        <EmailsPage />
      </Wrapper>
    );
    expect(screen.getByText(/Failed to load emails/i)).toBeInTheDocument();
  });
});

// ─── Sent Emails Tab — Empty ─────────────────────────────────────────────────

describe('EmailsPage — Sent emails tab — empty state', () => {
  it('shows "No emails sent yet" when there are zero events', () => {
    mockUseEmailEvents.mockReturnValue(infiniteResult([{ events: [], nextCursor: null }]));
    const Wrapper = makeWrapper();
    render(
      <Wrapper>
        <EmailsPage />
      </Wrapper>
    );
    expect(screen.getByText('No emails sent yet')).toBeInTheDocument();
  });
});

// ─── Sent Emails Tab — Table Rendering ───────────────────────────────────────

describe('EmailsPage — Sent emails tab — table rendering', () => {
  it('renders event rows with appointee names', () => {
    const Wrapper = makeWrapper();
    render(
      <Wrapper>
        <EmailsPage />
      </Wrapper>
    );
    expect(screen.getByText('Sophie Laurent')).toBeInTheDocument();
    expect(screen.getByText('James Chen')).toBeInTheDocument();
    expect(screen.getByText('Elena Petrova')).toBeInTheDocument();
  });

  it('renders email type labels in the table', () => {
    const Wrapper = makeWrapper();
    render(
      <Wrapper>
        <EmailsPage />
      </Wrapper>
    );
    // "Bio & Project" appears in filter dropdown AND table cells
    expect(screen.getAllByText('Bio & Project').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('VIT ID Invitation').length).toBeGreaterThanOrEqual(1);
  });

  it('renders status badges for statuses present in the data', () => {
    const Wrapper = makeWrapper();
    render(
      <Wrapper>
        <EmailsPage />
      </Wrapper>
    );
    // Status text appears as both filter buttons and table badges
    expect(screen.getAllByText('Sent').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('Failed').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('Pending').length).toBeGreaterThanOrEqual(2);
  });

  it('formats "claim_auto" triggered-by as "Auto on claim"', () => {
    const Wrapper = makeWrapper();
    render(
      <Wrapper>
        <EmailsPage />
      </Wrapper>
    );
    // Two events have claim_auto
    expect(screen.getAllByText('Auto on claim').length).toBeGreaterThanOrEqual(1);
  });

  it('formats "admin_manual:id:Name" triggered-by as "Manual (Name)"', () => {
    const Wrapper = makeWrapper();
    render(
      <Wrapper>
        <EmailsPage />
      </Wrapper>
    );
    expect(screen.getByText('Manual (Andrea Caselli)')).toBeInTheDocument();
  });

  it('formats legacy "admin_manual:id" triggered-by as "Manual (id)"', () => {
    const Wrapper = makeWrapper();
    render(
      <Wrapper>
        <EmailsPage />
      </Wrapper>
    );
    expect(screen.getByText('Manual (auth0|legacy999)')).toBeInTheDocument();
  });
});

// ─── Sent Emails Tab — Filters ───────────────────────────────────────────────

// The Base UI Select opens the trigger via keyboard here: its click-through
// protection ignores mouse clicks that land too soon after a previous
// pointerup, and jsdom timestamps make consecutive tests look instantaneous.
async function openSelect(user: ReturnType<typeof userEvent.setup>, name: RegExp) {
  screen.getByRole('combobox', { name }).focus();
  await user.keyboard('{Enter}');
}

describe('EmailsPage — Sent emails tab — filters', () => {
  it('filters by academic year', async () => {
    const user = userEvent.setup();
    const Wrapper = makeWrapper();
    render(
      <Wrapper>
        <EmailsPage />
      </Wrapper>
    );

    await openSelect(user, /filter by academic year/i);
    // Base UI mounts the select popup asynchronously, so query options with findByRole.
    await user.click(await screen.findByRole('option', { name: '2024-2025' }));

    // Only Elena (2024-2025) should appear
    expect(screen.getByText('Elena Petrova')).toBeInTheDocument();
    expect(screen.queryByText('Sophie Laurent')).not.toBeInTheDocument();
    expect(screen.queryByText('James Chen')).not.toBeInTheDocument();
  });

  it('filters by email type', async () => {
    const user = userEvent.setup();
    const Wrapper = makeWrapper();
    render(
      <Wrapper>
        <EmailsPage />
      </Wrapper>
    );

    await openSelect(user, /filter by email type/i);
    // Base UI mounts the select popup asynchronously, so query options with findByRole.
    await user.click(await screen.findByRole('option', { name: 'VIT ID Invitation' }));

    // Only James (VIT_ID_INVITATION) should appear
    expect(screen.getByText('James Chen')).toBeInTheDocument();
    expect(screen.queryByText('Sophie Laurent')).not.toBeInTheDocument();
  });

  it('filters by status toggle buttons', () => {
    const Wrapper = makeWrapper();
    render(
      <Wrapper>
        <EmailsPage />
      </Wrapper>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Failed status filter' }));

    // Only James (FAILED) should appear in the table
    expect(screen.getByText('James Chen')).toBeInTheDocument();
    expect(screen.queryByText('Sophie Laurent')).not.toBeInTheDocument();
    expect(screen.queryByText('Elena Petrova')).not.toBeInTheDocument();
  });

  it('initializes the year filter from the URL', () => {
    const Wrapper = makeWrapper('/admin/emails?year=2024-2025');
    render(
      <Wrapper>
        <EmailsPage />
      </Wrapper>
    );

    expect(screen.getByText('Elena Petrova')).toBeInTheDocument();
    expect(screen.queryByText('Sophie Laurent')).not.toBeInTheDocument();
    expect(screen.queryByText('James Chen')).not.toBeInTheDocument();
  });

  it('initializes the type filter from the URL', () => {
    const Wrapper = makeWrapper('/admin/emails?type=VIT_ID_INVITATION');
    render(
      <Wrapper>
        <EmailsPage />
      </Wrapper>
    );

    expect(screen.getByText('James Chen')).toBeInTheDocument();
    expect(screen.queryByText('Sophie Laurent')).not.toBeInTheDocument();
  });

  it('initializes the status filter from the URL', () => {
    const Wrapper = makeWrapper('/admin/emails?status=FAILED');
    render(
      <Wrapper>
        <EmailsPage />
      </Wrapper>
    );

    expect(screen.getByText('James Chen')).toBeInTheDocument();
    expect(screen.queryByText('Sophie Laurent')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Failed status filter' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('ignores invalid type/status values in the URL and shows everything', () => {
    const Wrapper = makeWrapper('/admin/emails?type=BOGUS&status=NOT_A_STATUS');
    render(
      <Wrapper>
        <EmailsPage />
      </Wrapper>
    );

    expect(screen.getByText('Sophie Laurent')).toBeInTheDocument();
    expect(screen.getByText('James Chen')).toBeInTheDocument();
    expect(screen.getByText('Elena Petrova')).toBeInTheDocument();
  });

  it('shows "No emails match these filters" when filters exclude all events', () => {
    const Wrapper = makeWrapper();
    render(
      <Wrapper>
        <EmailsPage />
      </Wrapper>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Skipped status filter' }));

    expect(screen.getByText('No emails match these filters')).toBeInTheDocument();
  });
});

// ─── Sent Emails Tab — Sorting ───────────────────────────────────────────────

// ─── Sent Emails Tab — Pagination ───────────────────────────────────────────

describe('EmailsPage — Sent emails tab — pagination', () => {
  it('shows "Load more" button when hasNextPage is true', () => {
    mockUseEmailEvents.mockReturnValue(
      infiniteResult([{ events: mockEvents.slice(0, 2), nextCursor: 'cursor-abc' }])
    );

    const Wrapper = makeWrapper();
    render(
      <Wrapper>
        <EmailsPage />
      </Wrapper>
    );

    expect(screen.getByRole('button', { name: 'Load more' })).toBeInTheDocument();
  });

  it('does not show "Load more" button when there is no next page', () => {
    const Wrapper = makeWrapper();
    render(
      <Wrapper>
        <EmailsPage />
      </Wrapper>
    );

    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
  });

  it('renders rows from every loaded page', () => {
    mockUseEmailEvents.mockReturnValue(
      infiniteResult([
        { events: [mockEvents[0]], nextCursor: 'cursor-abc' },
        { events: [mockEvents[1]], nextCursor: null },
      ])
    );

    const Wrapper = makeWrapper();
    render(
      <Wrapper>
        <EmailsPage />
      </Wrapper>
    );

    expect(screen.getByText('Sophie Laurent')).toBeInTheDocument();
    expect(screen.getByText('James Chen')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
  });

  it('wires "Load more" to fetchNextPage', async () => {
    const result = infiniteResult([{ events: [mockEvents[0]], nextCursor: 'cursor-abc' }]);
    mockUseEmailEvents.mockReturnValue(result);

    const Wrapper = makeWrapper();
    render(
      <Wrapper>
        <EmailsPage />
      </Wrapper>
    );

    await userEvent.setup().click(screen.getByRole('button', { name: 'Load more' }));

    expect(result.fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it('disables the button and shows the loading label while fetching the next page', () => {
    mockUseEmailEvents.mockReturnValue(
      infiniteResult([{ events: [mockEvents[0]], nextCursor: 'cursor-abc' }], {
        isFetchingNextPage: true,
      })
    );

    const Wrapper = makeWrapper();
    render(
      <Wrapper>
        <EmailsPage />
      </Wrapper>
    );

    const button = screen.getByRole('button', { name: 'Loading...' });
    expect(button).toBeDisabled();
  });

  it('reports a failed "Load more" inline, keeps loaded rows, and offers a retry', async () => {
    const result = infiniteResult([{ events: [mockEvents[0]], nextCursor: 'cursor-abc' }], {
      error: new Error('boom'),
      isFetchNextPageError: true,
    });
    mockUseEmailEvents.mockReturnValue(result);

    const Wrapper = makeWrapper();
    render(
      <Wrapper>
        <EmailsPage />
      </Wrapper>
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Could not load more emails.');
    // Rows already fetched stay on screen and the same page can be retried.
    expect(screen.getByText('Sophie Laurent')).toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }));

    expect(result.fetchNextPage).toHaveBeenCalledTimes(1);
  });
});

// ─── Sent Emails Tab — Row accessibility ─────────────────────────────────────

describe('EmailsPage — row accessibility', () => {
  it('exposes a real details button per row and no aria-selected on the <tr>', () => {
    const Wrapper = makeWrapper();
    render(
      <Wrapper>
        <EmailsPage />
      </Wrapper>
    );

    expect(
      screen.getByRole('button', { name: 'View details for Sophie Laurent' })
    ).toBeInTheDocument();
    for (const row of screen.getAllByRole('row')) {
      expect(row).not.toHaveAttribute('aria-selected');
      expect(row).not.toHaveAttribute('tabindex');
    }
  });

  it('opens the drawer from the row details button', async () => {
    mockUseEmailEventPreview.mockReturnValue({ data: null, isLoading: false, error: null });

    const Wrapper = makeWrapper();
    render(
      <Wrapper>
        <EmailsPage />
      </Wrapper>
    );

    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'View details for James Chen' }));

    expect(screen.getByText('Email Details')).toBeInTheDocument();
    expect(screen.getByText('Auth0 ID')).toBeInTheDocument();
  });
});

// ─── Sent Emails Tab — Sorting ───────────────────────────────────────────────

describe('EmailsPage — Sent emails tab — sorting', () => {
  it('toggles sort direction when clicking the Enqueued column header', () => {
    const Wrapper = makeWrapper();
    render(
      <Wrapper>
        <EmailsPage />
      </Wrapper>
    );

    const enqueuedButton = screen.getByRole('button', { name: /Enqueued/i });

    // Default sort is desc — first click should switch to asc
    fireEvent.click(enqueuedButton);

    // Get table rows (tbody rows)
    const rows = screen.getAllByRole('row').slice(1); // skip header
    // In asc order by enqueuedAt: James (Apr 8) -> Sophie (Apr 10) -> Elena (Apr 27)
    expect(within(rows[0]).getByText('James Chen')).toBeInTheDocument();
    expect(within(rows[2]).getByText('Elena Petrova')).toBeInTheDocument();
  });

  it('exposes aria-sort on the sortable header and initializes sort from the URL', () => {
    const Wrapper = makeWrapper('/admin/emails?sort=enqueuedAt&dir=asc');
    render(
      <Wrapper>
        <EmailsPage />
      </Wrapper>
    );

    const enqueuedHeader = screen
      .getByRole('button', { name: /Enqueued/i })
      .closest('th');
    expect(enqueuedHeader).toHaveAttribute('aria-sort', 'ascending');

    const rows = screen.getAllByRole('row').slice(1);
    expect(within(rows[0]).getByText('James Chen')).toBeInTheDocument();
    expect(within(rows[2]).getByText('Elena Petrova')).toBeInTheDocument();
  });

  it('marks the default sort as descending via aria-sort', () => {
    const Wrapper = makeWrapper();
    render(
      <Wrapper>
        <EmailsPage />
      </Wrapper>
    );

    const enqueuedHeader = screen
      .getByRole('button', { name: /Enqueued/i })
      .closest('th');
    expect(enqueuedHeader).toHaveAttribute('aria-sort', 'descending');
  });
});

// ─── Templates Tab ───────────────────────────────────────────────────────────

describe('EmailsPage — Templates tab', () => {
  it('renders template cards with subjects when loaded', async () => {
    mockUseTemplatePreview.mockImplementation((type: string | null) => {
      if (type === 'vit-id-invitation') {
        return {
          data: {
            subject: 'Welcome to I Tatti — Claim your VIT ID',
            html: '<p>Dear Sofia,</p>',
            text: 'Dear Sofia,',
            bcc: ['angela@itatti.harvard.edu'],
          },
          isLoading: false,
          error: null,
        };
      }
      if (type === 'bio-project-description') {
        return {
          data: {
            subject: 'Biography and Project Description',
            html: '<p>Dear Marco,</p>',
            text: 'Dear Marco,',
            bcc: [],
          },
          isLoading: false,
          error: null,
        };
      }
      return { data: null, isLoading: false, error: null };
    });

    const user = userEvent.setup();
    const Wrapper = makeWrapper();
    render(
      <Wrapper>
        <EmailsPage />
      </Wrapper>
    );

    // Switch to Templates tab
    await user.click(screen.getByRole('tab', { name: 'Templates' }));

    expect(screen.getByText(/Subject: Welcome to I Tatti/)).toBeInTheDocument();
    expect(screen.getByText(/Subject: Biography and Project Description/)).toBeInTheDocument();
  });

  it('shows loading spinner while template is loading', async () => {
    mockUseTemplatePreview.mockReturnValue({
      data: null,
      isLoading: true,
      error: null,
    });

    const user = userEvent.setup();
    const Wrapper = makeWrapper();
    const { container } = render(
      <Wrapper>
        <EmailsPage />
      </Wrapper>
    );

    await user.click(screen.getByRole('tab', { name: 'Templates' }));

    // The spinner uses "animate-spin" in its className
    expect(container.querySelectorAll('[class*="animate-spin"]').length).toBeGreaterThan(0);
  });

  it('shows error message when template preview fails', async () => {
    mockUseTemplatePreview.mockReturnValue({
      data: null,
      isLoading: false,
      error: new Error('template load failed'),
    });

    const user = userEvent.setup();
    const Wrapper = makeWrapper();
    render(
      <Wrapper>
        <EmailsPage />
      </Wrapper>
    );

    await user.click(screen.getByRole('tab', { name: 'Templates' }));

    expect(screen.getAllByText(/Failed to load template preview/).length).toBeGreaterThan(0);
  });

  it('shows BCC list when present', async () => {
    mockUseTemplatePreview.mockImplementation((type: string | null) => {
      if (type === 'vit-id-invitation') {
        return {
          data: {
            subject: 'Subject',
            html: '<p>body</p>',
            text: 'body',
            bcc: ['angela@itatti.harvard.edu', 'it@itatti.harvard.edu'],
          },
          isLoading: false,
          error: null,
        };
      }
      return { data: null, isLoading: false, error: null };
    });

    const user = userEvent.setup();
    const Wrapper = makeWrapper();
    render(
      <Wrapper>
        <EmailsPage />
      </Wrapper>
    );

    await user.click(screen.getByRole('tab', { name: 'Templates' }));

    expect(screen.getByText(/BCC: angela@itatti.harvard.edu, it@itatti.harvard.edu/)).toBeInTheDocument();
  });
});

// ─── How Emails Work Tab ─────────────────────────────────────────────────────

describe('EmailsPage — How emails work tab', () => {
  it('renders explanation sections for VIT ID Invitation and Bio & Project', async () => {
    const user = userEvent.setup();
    const Wrapper = makeWrapper();
    render(
      <Wrapper>
        <EmailsPage />
      </Wrapper>
    );

    await user.click(screen.getByRole('tab', { name: 'How emails work' }));

    expect(screen.getByText('VIT ID Invitation email')).toBeInTheDocument();
    expect(screen.getByText('Bio & Project Description email')).toBeInTheDocument();
  });

  it('renders the dev/staging redirect note', async () => {
    const user = userEvent.setup();
    const Wrapper = makeWrapper();
    render(
      <Wrapper>
        <EmailsPage />
      </Wrapper>
    );

    await user.click(screen.getByRole('tab', { name: 'How emails work' }));

    expect(screen.getByText(/APPOINTEE_EMAIL_REDIRECT_TO/)).toBeInTheDocument();
  });
});

// ─── Email Drawer ────────────────────────────────────────────────────────────

describe('EmailsPage — Email Drawer', () => {
  it('opens when clicking an event row and shows event details', () => {
    mockUseEmailEventPreview.mockReturnValue({
      data: {
        subject: 'Welcome',
        html: '<p>Dear Sophie,</p>',
        text: 'Dear Sophie,',
        bcc: [],
        recipientStatus: 'current',
      },
      isLoading: false,
      error: null,
    });

    const Wrapper = makeWrapper();
    render(
      <Wrapper>
        <EmailsPage />
      </Wrapper>
    );

    // Click on Sophie's row
    fireEvent.click(screen.getByText('Sophie Laurent'));

    // Drawer should open with details
    expect(screen.getByText('Email Details')).toBeInTheDocument();
  });

  it('shows Auth0 ID in drawer for admin_manual events', () => {
    mockUseEmailEventPreview.mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
    });

    const Wrapper = makeWrapper();
    render(
      <Wrapper>
        <EmailsPage />
      </Wrapper>
    );

    // Click on James's row (has admin_manual:auth0|andrea123:Andrea Caselli)
    fireEvent.click(screen.getByText('James Chen'));

    expect(screen.getByText('Auth0 ID')).toBeInTheDocument();
    expect(screen.getByText('auth0|andrea123')).toBeInTheDocument();
  });

  it('shows failure reason section for FAILED events', () => {
    mockUseEmailEventPreview.mockReturnValue({
      data: null,
      isLoading: true,
      error: null,
    });

    const Wrapper = makeWrapper();
    render(
      <Wrapper>
        <EmailsPage />
      </Wrapper>
    );

    // Click on James's row (FAILED)
    fireEvent.click(screen.getByText('James Chen'));

    expect(screen.getByText('Failure reason')).toBeInTheDocument();
    expect(screen.getByText('SES rejected: Email address is not verified.')).toBeInTheDocument();
  });

  it('shows "Open in Manage Appointees" link for FAILED events', () => {
    mockUseEmailEventPreview.mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
    });

    const Wrapper = makeWrapper();
    render(
      <Wrapper>
        <EmailsPage />
      </Wrapper>
    );

    fireEvent.click(screen.getByText('James Chen'));

    expect(screen.getByText('Open in Manage Appointees')).toBeInTheDocument();
    expect(screen.getByText('Open in Manage Appointees').closest('a')).toHaveAttribute(
      'href',
      '/admin/fellows'
    );
  });

  it('shows SES message ID with copy button for SENT events', () => {
    mockUseEmailEventPreview.mockReturnValue({
      data: {
        subject: 'Welcome',
        html: '<p>body</p>',
        text: 'body',
        bcc: [],
        recipientStatus: 'current',
      },
      isLoading: false,
      error: null,
    });

    const Wrapper = makeWrapper();
    render(
      <Wrapper>
        <EmailsPage />
      </Wrapper>
    );

    // Click on Sophie (has sesMessageId)
    fireEvent.click(screen.getByText('Sophie Laurent'));

    expect(screen.getByText('ses-123')).toBeInTheDocument();
    expect(screen.getByLabelText('Copy SES message ID')).toBeInTheDocument();
  });

  it('shows contact_deleted warning when recipientStatus is contact_deleted', () => {
    mockUseEmailEventPreview.mockReturnValue({
      data: {
        subject: 'Welcome',
        html: '<p>body</p>',
        text: 'body',
        bcc: [],
        recipientStatus: 'contact_deleted',
      },
      isLoading: false,
      error: null,
    });

    const Wrapper = makeWrapper();
    render(
      <Wrapper>
        <EmailsPage />
      </Wrapper>
    );

    fireEvent.click(screen.getByText('Sophie Laurent'));

    expect(screen.getByText(/Original recipient no longer in CiviCRM/)).toBeInTheDocument();
  });

  it('shows no_first_name warning when recipientStatus is no_first_name', () => {
    mockUseEmailEventPreview.mockReturnValue({
      data: {
        subject: 'Welcome',
        html: '<p>body</p>',
        text: 'body',
        bcc: [],
        recipientStatus: 'no_first_name',
      },
      isLoading: false,
      error: null,
    });

    const Wrapper = makeWrapper();
    render(
      <Wrapper>
        <EmailsPage />
      </Wrapper>
    );

    fireEvent.click(screen.getByText('Sophie Laurent'));

    expect(screen.getByText(/no first name on file/)).toBeInTheDocument();
  });

  it('shows preview error when loading preview fails', () => {
    mockUseEmailEventPreview.mockReturnValue({
      data: null,
      isLoading: false,
      error: new Error('civicrm_unavailable'),
    });

    const Wrapper = makeWrapper();
    render(
      <Wrapper>
        <EmailsPage />
      </Wrapper>
    );

    fireEvent.click(screen.getByText('Sophie Laurent'));

    expect(screen.getByText(/Failed to load preview: civicrm_unavailable/)).toBeInTheDocument();
  });
});
