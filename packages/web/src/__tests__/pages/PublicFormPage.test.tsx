import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider, useNavigate } from 'react-router';
import { useState } from 'react';

const { mockUsePublicForm, mockUseSubmitForm, mockMutate } = vi.hoisted(() => ({
  mockUsePublicForm: vi.fn(),
  mockUseSubmitForm: vi.fn(),
  mockMutate: vi.fn(),
}));

vi.mock('@/api/forms', () => ({
  PublicFormRequestError: class PublicFormRequestError extends Error {
    constructor(message: string, public status?: number) {
      super(message);
    }
  },
  PublicFormSubmitError: class PublicFormSubmitError extends Error {
    constructor(
      message: string,
      public status: number,
      public issues: { path: string; message: string }[] = []
    ) {
      super(message);
    }
  },
  usePublicForm: mockUsePublicForm,
  useSubmitForm: mockUseSubmitForm,
}));

import { PublicFormPage } from '@/pages/forms/PublicFormPage';
import { PublicFormRequestError, PublicFormSubmitError } from '@/api/forms';
import type { FormDef } from '@itatti/shared';

const minimalForm: FormDef = {
  id: 'fellow-memorandum',
  title: 'Fellow Memorandum',
  appointmentTypes: ['Fellow'],
  sections: [
    {
      title: 'Info',
      fields: [{ name: 'fullName', label: 'Full name', type: 'text', required: true }],
    },
  ],
};

// Inside the route element: a button that calls useNavigate() to push
// /forms/tokB. No unmount, no router remount — React Router keeps the same
// PublicFormPage instance alive and only useParams() changes.
function NavButton() {
  const navigate = useNavigate();
  return <button onClick={() => void navigate('/forms/tokB')}>nav</button>;
}

/**
 * PublicFormRenderer calls useBlocker, which only works under a data router,
 * so the page mounts through createMemoryRouter. The route element is fixed at
 * router creation, so plain rerender() can't reach the page — rerenderPage()
 * bumps harness state instead (used after changing what the mocks return).
 */
function renderPage({ token = 'tok_abc', withNav = false } = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  let bump: () => void = () => {};
  function Harness() {
    const [, setVersion] = useState(0);
    bump = () => setVersion((v) => v + 1);
    return (
      <>
        {withNav && <NavButton />}
        <PublicFormPage />
      </>
    );
  }
  const router = createMemoryRouter([{ path: '/forms/:token', element: <Harness /> }], {
    initialEntries: [`/forms/${token}`],
  });
  const utils = render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
  return { ...utils, rerenderPage: () => act(() => bump()) };
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('PublicFormPage — submission flow', () => {
  // Regression: form-submission-already-submitted.
  //
  // A successful local mutation owns the Thank You screen. Server status stays
  // authoritative for links submitted elsewhere or expired while the page is
  // open, so a refetch can safely replace a stale form.

  it('shows "Form Already Submitted" when the link was ALREADY used before this session', () => {
    mockUsePublicForm.mockReturnValue({
      data: {
        id: 'inv_1',
        formType: 'fellow-memorandum',
        status: 'submitted',
        submittedAt: '2026-04-24T10:00:00.000Z',
        expiresAt: '2026-10-24T10:00:00.000Z',
        formDef: minimalForm,
      },
      isLoading: false,
      error: null,
    });
    mockUseSubmitForm.mockReturnValue({
      mutate: mockMutate,
      isPending: false,
      error: null,
      isSuccess: false,
    });

    renderPage();

    expect(screen.getByText(/Form Already Submitted/)).toBeInTheDocument();
    // Not the renderer's success screen — this is the re-visit message.
    expect(screen.queryByText(/Your form has been submitted successfully/)).not.toBeInTheDocument();
  });

  it.each([
    [404, 'Form Not Found', false],
    [410, 'Form Link Expired', false],
    [429, 'Too Many Requests', true],
    [503, 'Form Temporarily Unavailable', true],
  ])('renders the correct load failure for HTTP %s', (status, heading, canRetry) => {
    const refetch = vi.fn();
    mockUsePublicForm.mockReturnValue({
      data: undefined,
      isLoading: false,
      isFetching: false,
      error: new PublicFormRequestError('load failed', status),
      refetch,
    });
    mockUseSubmitForm.mockReturnValue({
      mutate: mockMutate,
      isPending: false,
      error: null,
      isSuccess: false,
    });

    renderPage();

    expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' }) !== null).toBe(canRetry);
    if (canRetry) {
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
      expect(refetch).toHaveBeenCalledOnce();
    }
  });

  it('shows the form when the link is pending (fresh link)', () => {
    mockUsePublicForm.mockReturnValue({
      data: {
        id: 'inv_1',
        formType: 'fellow-memorandum',
        status: 'pending',
        submittedAt: null,
        expiresAt: '2026-10-24T10:00:00.000Z',
        formDef: minimalForm,
      },
      isLoading: false,
      error: null,
    });
    mockUseSubmitForm.mockReturnValue({
      mutate: mockMutate,
      isPending: false,
      error: null,
      isSuccess: false,
    });

    renderPage();

    expect(screen.getByRole('heading', { name: 'Fellow Memorandum' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Submit/ })).toBeInTheDocument();
  });

  it('does not render fields for an expired link', () => {
    mockUsePublicForm.mockReturnValue({
      data: {
        id: 'inv_1',
        formType: 'fellow-memorandum',
        status: 'expired',
        submittedAt: null,
        expiresAt: '2026-07-01T00:00:00.000Z',
        formDef: minimalForm,
      },
      isLoading: false,
      error: null,
    });
    mockUseSubmitForm.mockReturnValue({
      mutate: mockMutate,
      isPending: false,
      error: null,
      isSuccess: false,
    });

    renderPage();

    expect(screen.getByRole('heading', { name: 'Form Link Expired' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Submit/ })).not.toBeInTheDocument();
  });

  it('stops showing a stale form when a refetch changes pending to expired', () => {
    mockUsePublicForm.mockReturnValue({
      data: {
        id: 'inv_1',
        formType: 'fellow-memorandum',
        status: 'pending',
        submittedAt: null,
        expiresAt: '2026-10-24T10:00:00.000Z',
        formDef: minimalForm,
      },
      isLoading: false,
      isFetching: false,
      error: null,
      refetch: vi.fn(),
    });
    mockUseSubmitForm.mockReturnValue({
      mutate: mockMutate,
      isPending: false,
      error: null,
      isSuccess: false,
    });

    const { rerenderPage } = renderPage();
    expect(screen.getByRole('button', { name: /Submit/ })).toBeInTheDocument();

    mockUsePublicForm.mockReturnValue({
      data: {
        id: 'inv_1',
        formType: 'fellow-memorandum',
        status: 'expired',
        submittedAt: null,
        expiresAt: '2026-07-01T00:00:00.000Z',
        formDef: minimalForm,
      },
      isLoading: false,
      isFetching: false,
      error: null,
      refetch: vi.fn(),
    });

    rerenderPage();
    expect(screen.getByRole('heading', { name: 'Form Link Expired' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Submit/ })).not.toBeInTheDocument();
  });

  it('keeps a partially-filled form when a background refetch fails with stale data present', async () => {
    // TanStack Query keeps stale `data` AND sets `error` when a background
    // refetch fails (focus refetch on flaky wifi, or a 410 because the window
    // expired mid-fill). The error screen must NOT replace the form: the
    // renderer holds all typed values and unmounting it destroys them.
    const pendingReturn = {
      data: {
        id: 'inv_1',
        formType: 'fellow-memorandum',
        status: 'pending',
        submittedAt: null,
        expiresAt: '2026-10-24T10:00:00.000Z',
        formDef: minimalForm,
      },
      isLoading: false,
      isFetching: false,
      error: null,
      refetch: vi.fn(),
    };
    mockUsePublicForm.mockReturnValue(pendingReturn);
    mockUseSubmitForm.mockReturnValue({
      mutate: mockMutate,
      isPending: false,
      error: null,
      isSuccess: false,
    });

    const { rerenderPage } = renderPage();

    const user = userEvent.setup();
    await user.type(screen.getAllByRole('textbox')[0], 'Maria Bianchi');

    mockUsePublicForm.mockReturnValue({
      ...pendingReturn,
      error: new PublicFormRequestError('gone', 410),
    });
    rerenderPage();

    // Still the form, with the typed value intact — not the expired screen.
    expect(screen.getByRole('button', { name: /Submit/ })).toBeInTheDocument();
    expect(screen.getAllByRole('textbox')[0]).toHaveValue('Maria Bianchi');
    expect(screen.queryByRole('heading', { name: 'Form Link Expired' })).not.toBeInTheDocument();
  });

  it('stops refetching on window focus once the form data has loaded', () => {
    // A mid-fill focus refetch that comes back changed (expired or submitted
    // elsewhere) would unmount the renderer and destroy the typed values, so
    // focus refetching ends as soon as the form has data to show.
    mockUsePublicForm.mockReturnValue({
      data: {
        id: 'inv_1',
        formType: 'fellow-memorandum',
        status: 'pending',
        submittedAt: null,
        expiresAt: '2026-10-24T10:00:00.000Z',
        formDef: minimalForm,
      },
      isLoading: false,
      error: null,
    });
    mockUseSubmitForm.mockReturnValue({
      mutate: mockMutate,
      isPending: false,
      error: null,
      isSuccess: false,
    });

    renderPage();

    expect(mockUsePublicForm).toHaveBeenLastCalledWith('tok_abc', { refetchOnWindowFocus: false });
  });

  it('shows the "Thank you!" success screen after a just-completed submit — NOT "Already Submitted"', async () => {
    // Mount with pending status (appointee opens a fresh link).
    mockUsePublicForm.mockReturnValue({
      data: {
        id: 'inv_1',
        formType: 'fellow-memorandum',
        status: 'pending',
        submittedAt: null,
        expiresAt: '2026-10-24T10:00:00.000Z',
        formDef: minimalForm,
      },
      isLoading: false,
      error: null,
    });
    mockUseSubmitForm.mockReturnValue({
      mutate: mockMutate,
      isPending: false,
      error: null,
      isSuccess: false,
    });

    const { rerenderPage } = renderPage();

    // Form is showing.
    expect(screen.getByRole('button', { name: /Submit/ })).toBeInTheDocument();

    // Now simulate the post-submit state: query refetch returns status:
    // 'submitted' AND the mutation is isSuccess=true. This is the exact
    // race the fix addresses.
    mockUsePublicForm.mockReturnValue({
      data: {
        id: 'inv_1',
        formType: 'fellow-memorandum',
        status: 'submitted',
        submittedAt: '2026-05-07T10:00:00.000Z',
        expiresAt: '2026-10-24T10:00:00.000Z',
        formDef: minimalForm,
      },
      isLoading: false,
      error: null,
    });
    mockUseSubmitForm.mockReturnValue({
      mutate: mockMutate,
      isPending: false,
      error: null,
      isSuccess: true,
    });

    rerenderPage();

    await waitFor(() => {
      // MUST be the renderer's success screen, NOT the "Already Submitted" branch.
      expect(screen.getByText(/Your form has been submitted successfully/)).toBeInTheDocument();
    });
    expect(screen.queryByText(/Form Already Submitted/)).not.toBeInTheDocument();

    // Chrome-hiding: the form's title block (an h1 with the form title and,
    // if present, the privacy-policy description) must NOT render above the
    // success screen. Otherwise appointees see "Fellow Memorandum" + full
    // privacy paragraph + "Thank you" — half-form, half-confirmation UI.
    expect(screen.queryByRole('heading', { level: 1, name: 'Fellow Memorandum' })).not.toBeInTheDocument();
    // The renderer's own heading is an <h2>, not an <h1>, so this assertion
    // only catches the page-level title block.
    expect(screen.getByRole('heading', { level: 2, name: 'Thank you!' })).toBeInTheDocument();
    // New closing copy from the design: appointee can close the window.
    expect(screen.getByText(/You may now close this window/)).toBeInTheDocument();
  });

  it('renders the current token state when navigating between form links', async () => {
    mockUsePublicForm.mockImplementation((token: string) => {
      if (token === 'tokA') {
        return {
          data: {
            id: 'inv_1',
            formType: 'fellow-memorandum',
            status: 'submitted',
            submittedAt: '2026-04-24T10:00:00.000Z',
            expiresAt: '2026-10-24T10:00:00.000Z',
            formDef: minimalForm,
          },
          isLoading: false,
          error: null,
        };
      }
      return {
        data: {
          id: 'inv_2',
          formType: 'fellow-memorandum',
          status: 'pending',
          submittedAt: null,
          expiresAt: '2026-10-24T10:00:00.000Z',
          formDef: minimalForm,
        },
        isLoading: false,
        error: null,
      };
    });
    mockUseSubmitForm.mockReturnValue({
      mutate: mockMutate,
      isPending: false,
      error: null,
      isSuccess: false,
    });

    renderPage({ token: 'tokA', withNav: true });

    // tokA is submitted → expect the re-visit message.
    expect(screen.getByText(/Form Already Submitted/)).toBeInTheDocument();

    // Navigate to tokB (pending) without remounting the router.
    await userEvent.setup().click(screen.getByRole('button', { name: 'nav' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Submit/ })).toBeInTheDocument();
    });
    expect(screen.queryByText(/Form Already Submitted/)).not.toBeInTheDocument();
  });

  it('keeps the confirmation screen when the post-submit refetch 404s on the rotated token', () => {
    // The server rotates the token on submit, so a window-focus refetch after
    // staleTime returns 404. The local success must still own the screen —
    // otherwise the appointee is told the form was not found.
    mockUsePublicForm.mockReturnValue({
      data: undefined,
      isLoading: false,
      isFetching: false,
      error: new PublicFormRequestError('Form not found', 404),
      refetch: vi.fn(),
    });
    mockUseSubmitForm.mockReturnValue({
      mutate: mockMutate,
      isPending: false,
      error: null,
      isSuccess: true,
    });

    renderPage();

    expect(screen.getByText(/Your form has been submitted successfully/)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Form Not Found' })).not.toBeInTheDocument();
  });

  it('stops refetching on window focus once the submit succeeded', () => {
    mockUsePublicForm.mockReturnValue({
      data: {
        id: 'inv_1',
        formType: 'fellow-memorandum',
        status: 'pending',
        submittedAt: null,
        expiresAt: '2026-10-24T10:00:00.000Z',
        formDef: minimalForm,
      },
      isLoading: false,
      error: null,
    });
    mockUseSubmitForm.mockReturnValue({
      mutate: mockMutate,
      isPending: false,
      error: null,
      isSuccess: true,
    });

    renderPage();

    expect(mockUsePublicForm).toHaveBeenCalledWith('tok_abc', { refetchOnWindowFocus: false });
  });

  it('does not inherit the previous link submit state when the token changes in place', async () => {
    // The mock keeps submit state per component instance, the way React Query's
    // mutation observer does. Only a remount (key={token}) clears it, so this
    // fails if PublicFormPage keeps one instance across both links.
    mockUsePublicForm.mockReturnValue({
      data: {
        id: 'inv_1',
        formType: 'fellow-memorandum',
        status: 'pending',
        submittedAt: null,
        expiresAt: '2026-10-24T10:00:00.000Z',
        formDef: minimalForm,
      },
      isLoading: false,
      error: null,
    });
    mockUseSubmitForm.mockImplementation(() => {
      const [isSuccess, setIsSuccess] = useState(false);
      return {
        mutate: () => setIsSuccess(true),
        isPending: false,
        error: null,
        isSuccess,
      };
    });

    renderPage({ token: 'tokA', withNav: true });

    const user = userEvent.setup();
    await user.type(screen.getAllByRole('textbox')[0], 'Maria Bianchi');
    await user.click(screen.getByRole('button', { name: /Submit/ }));
    expect(screen.getByText(/Your form has been submitted successfully/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'nav' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Submit/ })).toBeInTheDocument();
    });
    expect(screen.queryByText(/Your form has been submitted successfully/)).not.toBeInTheDocument();
  });

  it('falls back to a date-free message when submittedAt is missing', () => {
    mockUsePublicForm.mockReturnValue({
      data: {
        id: 'inv_1',
        formType: 'fellow-memorandum',
        status: 'submitted',
        submittedAt: null,
        expiresAt: '2026-10-24T10:00:00.000Z',
        formDef: minimalForm,
      },
      isLoading: false,
      error: null,
    });
    mockUseSubmitForm.mockReturnValue({
      mutate: mockMutate,
      isPending: false,
      error: null,
      isSuccess: false,
    });

    renderPage();

    expect(screen.getByText(/This form has already been submitted/)).toBeInTheDocument();
    expect(screen.queryByText(/Invalid Date/)).not.toBeInTheDocument();
  });

  it('renders the server field detail behind a 400 validation failure', () => {
    mockUsePublicForm.mockReturnValue({
      data: {
        id: 'inv_1',
        formType: 'fellow-memorandum',
        status: 'pending',
        submittedAt: null,
        expiresAt: '2026-10-24T10:00:00.000Z',
        formDef: minimalForm,
      },
      isLoading: false,
      error: null,
    });
    mockUseSubmitForm.mockReturnValue({
      mutate: mockMutate,
      isPending: false,
      error: new PublicFormSubmitError('Validation failed', 400, [
        { path: 'fullName', message: 'String must contain at most 200 character(s)' },
      ]),
      isSuccess: false,
    });

    renderPage();

    expect(screen.getByText('Validation failed')).toBeInTheDocument();
    expect(
      screen.getByText(/Full name: String must contain at most 200 character\(s\)/)
    ).toBeInTheDocument();
  });

  it.each([
    ['a network failure', new TypeError('Failed to fetch'), 'Failed to fetch'],
    [
      'a 5xx response',
      new PublicFormSubmitError('Internal Server Error', 500),
      'Internal Server Error',
    ],
  ])(
    'shows the translated generic message — not the raw error — when the submit fails on %s',
    (_label, error, rawMessage) => {
      // Error contract: raw transport/server internals never reach the
      // appointee. Only deliberate 4xx messages (validation, expiry) pass
      // through; everything else gets the translated fallback.
      mockUsePublicForm.mockReturnValue({
        data: {
          id: 'inv_1',
          formType: 'fellow-memorandum',
          status: 'pending',
          submittedAt: null,
          expiresAt: '2026-10-24T10:00:00.000Z',
          formDef: minimalForm,
        },
        isLoading: false,
        error: null,
      });
      mockUseSubmitForm.mockReturnValue({
        mutate: mockMutate,
        isPending: false,
        error,
        isSuccess: false,
      });

      renderPage();

      expect(screen.getByRole('alert')).toHaveTextContent(/We could not submit your form/);
      expect(screen.queryByText(rawMessage)).not.toBeInTheDocument();
    }
  );

  it('passes submitted values through useSubmitForm.mutate when the form is submitted', async () => {
    mockUsePublicForm.mockReturnValue({
      data: {
        id: 'inv_1',
        formType: 'fellow-memorandum',
        status: 'pending',
        submittedAt: null,
        expiresAt: '2026-10-24T10:00:00.000Z',
        formDef: minimalForm,
      },
      isLoading: false,
      error: null,
    });
    mockUseSubmitForm.mockReturnValue({
      mutate: mockMutate,
      isPending: false,
      error: null,
      isSuccess: false,
    });

    renderPage();

    const user = userEvent.setup();
    // minimalForm has exactly one text field; PublicFormRenderer's labels
    // lack htmlFor/id association so getByLabelText doesn't work. The
    // single-textbox assertion is intentional — if the fixture ever gains
    // another input, this test should fail loudly rather than type into
    // the wrong field.
    const textboxes = screen.getAllByRole('textbox');
    expect(textboxes).toHaveLength(1);
    await user.type(textboxes[0], 'Maria Bianchi');
    await user.click(screen.getByRole('button', { name: /Submit/ }));

    expect(mockMutate).toHaveBeenCalledWith({ fullName: 'Maria Bianchi' });
  });
});
