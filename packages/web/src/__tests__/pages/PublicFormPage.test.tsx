import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';

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
  usePublicForm: mockUsePublicForm,
  useSubmitForm: mockUseSubmitForm,
}));

import { PublicFormPage } from '@/pages/forms/PublicFormPage';
import { PublicFormRequestError } from '@/api/forms';
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

function makeWrapper(initialToken = 'tok_abc') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/forms/${initialToken}`]}>
        <Routes>
          <Route path="/forms/:token" element={children} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
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

    render(<PublicFormPage />, { wrapper: makeWrapper() });

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

    render(<PublicFormPage />, { wrapper: makeWrapper() });

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

    render(<PublicFormPage />, { wrapper: makeWrapper() });

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

    render(<PublicFormPage />, { wrapper: makeWrapper() });

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

    const { rerender } = render(<PublicFormPage />, { wrapper: makeWrapper() });
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

    rerender(<PublicFormPage />);
    expect(screen.getByRole('heading', { name: 'Form Link Expired' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Submit/ })).not.toBeInTheDocument();
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

    const { rerender } = render(<PublicFormPage />, { wrapper: makeWrapper() });

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

    rerender(<PublicFormPage />);

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

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
    });
    // Inside the route element: a button that calls useNavigate() to push
    // /forms/tokB. No unmount, no router remount — React Router keeps the
    // same PublicFormPage instance alive and only useParams() changes.
    const NavButton = () => {
      const navigate = useNavigate();
      return <button onClick={() => navigate('/forms/tokB')}>nav</button>;
    };
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/forms/tokA']}>
          <Routes>
            <Route
              path="/forms/:token"
              element={
                <>
                  <NavButton />
                  <PublicFormPage />
                </>
              }
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    // tokA is submitted → expect the re-visit message.
    expect(screen.getByText(/Form Already Submitted/)).toBeInTheDocument();

    // Navigate to tokB (pending) without remounting the router.
    await userEvent.setup().click(screen.getByRole('button', { name: 'nav' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Submit/ })).toBeInTheDocument();
    });
    expect(screen.queryByText(/Form Already Submitted/)).not.toBeInTheDocument();
  });

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

    render(<PublicFormPage />, { wrapper: makeWrapper() });

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
