import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

// Mock the hook — this test only exercises branch rendering, not network.
const { mockUseVitIdLookup } = vi.hoisted(() => ({ mockUseVitIdLookup: vi.fn() }));

vi.mock('@/api/vit-id-lookup', () => ({
  useVitIdLookup: mockUseVitIdLookup,
}));

import { HasVitIdPage } from '@/pages/admin/HasVitIdPage';

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

function setHookState(state: Partial<ReturnType<typeof mockUseVitIdLookup>>) {
  mockUseVitIdLookup.mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    ...state,
  });
}

beforeEach(() => {
  mockUseVitIdLookup.mockReset();
  setHookState({});
});

describe('HasVitIdPage — empty state', () => {
  it('shows the intro prompt when query is empty', () => {
    const Wrapper = makeWrapper();
    render(
      <Wrapper>
        <HasVitIdPage />
      </Wrapper>
    );
    expect(screen.getByText(/Type a name or an email address/i)).toBeInTheDocument();
  });

  it('hides the email-tip when no query', () => {
    const Wrapper = makeWrapper();
    render(
      <Wrapper>
        <HasVitIdPage />
      </Wrapper>
    );
    // Tip only shows when query is typed but doesn't contain @.
    expect(screen.queryByText(/to check a specific email/i)).not.toBeInTheDocument();
  });
});

describe('HasVitIdPage — loading state', () => {
  it('shows "Searching..." when isLoading and query is non-empty', () => {
    setHookState({ isLoading: true });
    const Wrapper = makeWrapper();
    render(
      <Wrapper>
        <HasVitIdPage />
      </Wrapper>
    );
    fireEvent.change(screen.getByLabelText(/search by name or email/i), {
      target: { value: 'maria' },
    });
    expect(screen.getByText(/Searching/i)).toBeInTheDocument();
  });
});

describe('HasVitIdPage — error state', () => {
  it('renders the amber error panel with retry', () => {
    const refetch = vi.fn();
    setHookState({ isError: true, refetch });
    const Wrapper = makeWrapper();
    render(
      <Wrapper>
        <HasVitIdPage />
      </Wrapper>
    );
    fireEvent.change(screen.getByLabelText(/search by name or email/i), {
      target: { value: 'maria' },
    });
    expect(screen.getByText(/Search failed/i)).toBeInTheDocument();

    fireEvent.click(screen.getByText(/Retry/i));
    expect(refetch).toHaveBeenCalled();
  });
});

describe('HasVitIdPage — email-lookup branch', () => {
  it('renders no-account for unknown email', () => {
    setHookState({
      data: { kind: 'email-lookup', match: { status: 'no-account' } },
    });
    const Wrapper = makeWrapper();
    render(
      <Wrapper>
        <HasVitIdPage />
      </Wrapper>
    );
    fireEvent.change(screen.getByLabelText(/search by name or email/i), {
      target: { value: 'unknown@x.com' },
    });
    expect(screen.getByText(/No account found for/i)).toBeInTheDocument();
  });

  it('renders active-different-email badge + matched email for returning fellow', () => {
    setHookState({
      data: {
        kind: 'email-lookup',
        match: {
          status: 'active-different-email',
          matchedVia: 'civicrm-id',
          matched: {
            userId: 'auth0|thomas',
            email: 'old@x.com',
            civicrmId: '8',
            name: 'Thomas Müller',
          },
        },
      },
    });
    const Wrapper = makeWrapper();
    render(
      <Wrapper>
        <HasVitIdPage />
      </Wrapper>
    );
    fireEvent.change(screen.getByLabelText(/search by name or email/i), {
      target: { value: 'new@x.com' },
    });
    expect(screen.getByText('Active (different email)')).toBeInTheDocument();
    expect(
      screen.getByText((content) => content.includes('old@x.com'))
    ).toBeInTheDocument();
    expect(
      screen.getByText((content) => content.includes('Thomas Müller'))
    ).toBeInTheDocument();
  });

  it('renders needs-review badge with duplicate-civicrm-contact reason', () => {
    setHookState({
      data: {
        kind: 'email-lookup',
        match: {
          status: 'needs-review',
          reason: 'duplicate-civicrm-contact',
          candidates: [],
        },
      },
    });
    const Wrapper = makeWrapper();
    render(
      <Wrapper>
        <HasVitIdPage />
      </Wrapper>
    );
    fireEvent.change(screen.getByLabelText(/search by name or email/i), {
      target: { value: 'shared@x.com' },
    });
    expect(screen.getByText('Needs review')).toBeInTheDocument();
  });
});

describe('HasVitIdPage — name-search branch', () => {
  it('renders empty message when no candidates match', () => {
    setHookState({
      data: { kind: 'name-search', candidates: [] },
    });
    const Wrapper = makeWrapper();
    render(
      <Wrapper>
        <HasVitIdPage />
      </Wrapper>
    );
    fireEvent.change(screen.getByLabelText(/search by name or email/i), {
      target: { value: 'nobody' },
    });
    expect(screen.getByText(/No one matching/i)).toBeInTheDocument();
  });

  it('renders candidate list with email + civicrm_id for each match', () => {
    setHookState({
      data: {
        kind: 'name-search',
        candidates: [
          { userId: 'auth0|1', email: 'maria1@x.com', civicrmId: '10', name: 'Maria Rossi' },
          { userId: 'auth0|2', email: 'maria2@x.com', civicrmId: null, name: 'Maria Bianchi' },
        ],
      },
    });
    const Wrapper = makeWrapper();
    render(
      <Wrapper>
        <HasVitIdPage />
      </Wrapper>
    );
    fireEvent.change(screen.getByLabelText(/search by name or email/i), {
      target: { value: 'maria' },
    });
    expect(screen.getByText(/2 matches for/i)).toBeInTheDocument();
    expect(screen.getByText('Maria Rossi')).toBeInTheDocument();
    expect(screen.getByText('maria1@x.com')).toBeInTheDocument();
    expect(screen.getByText(/civicrm_id: 10/i)).toBeInTheDocument();
    expect(screen.getByText('Maria Bianchi')).toBeInTheDocument();
    expect(screen.getByText('maria2@x.com')).toBeInTheDocument();
  });

  it('shows the email-tip only when query does NOT contain @', () => {
    setHookState({
      data: { kind: 'name-search', candidates: [] },
    });
    const Wrapper = makeWrapper();
    render(
      <Wrapper>
        <HasVitIdPage />
      </Wrapper>
    );
    fireEvent.change(screen.getByLabelText(/search by name or email/i), {
      target: { value: 'maria' },
    });
    expect(
      screen.getByText((content) => content.includes('paste the full email'))
    ).toBeInTheDocument();
  });

  it('hides the email-tip when query contains @', () => {
    setHookState({
      data: { kind: 'email-lookup', match: { status: 'no-account' } },
    });
    const Wrapper = makeWrapper();
    render(
      <Wrapper>
        <HasVitIdPage />
      </Wrapper>
    );
    fireEvent.change(screen.getByLabelText(/search by name or email/i), {
      target: { value: 'maria@x.com' },
    });
    expect(
      screen.queryByText((content) => content.includes('paste the full email'))
    ).not.toBeInTheDocument();
  });
});
