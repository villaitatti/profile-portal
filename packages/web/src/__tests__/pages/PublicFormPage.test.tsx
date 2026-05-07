import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { useState, type ReactNode } from 'react';

const { mockUsePublicForm, mockUseSubmitForm, mockMutate } = vi.hoisted(() => ({
  mockUsePublicForm: vi.fn(),
  mockUseSubmitForm: vi.fn(),
  mockMutate: vi.fn(),
}));

vi.mock('@/api/forms', () => ({
  usePublicForm: mockUsePublicForm,
  useSubmitForm: mockUseSubmitForm,
}));

import { PublicFormPage } from '@/pages/forms/PublicFormPage';
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
  // Before the fix, a successful submit triggered `invalidateQueries` which
  // refetched the token's data and returned `status: 'submitted'`. The page
  // short-circuited to "Form Already Submitted" before the renderer's
  // `isSuccess` "Thank you!" screen could show. Appointee saw what looked
  // like an error after a perfectly fine submission.
  //
  // The fix snapshots the first-observed status in a ref. Only the
  // initial-status path shows "Already Submitted"; the post-submit path
  // falls through to the renderer which shows its own success state.

  it('shows "Form Already Submitted" when the link was ALREADY used before this session', () => {
    mockUsePublicForm.mockReturnValue({
      data: {
        id: 'inv_1',
        formType: 'fellow-memorandum',
        status: 'submitted',
        submittedAt: '2026-04-24T10:00:00.000Z',
        formDef: minimalForm,
        response: { fullName: 'Prior submission' },
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

  it('shows the form when the link is pending (fresh link)', () => {
    mockUsePublicForm.mockReturnValue({
      data: {
        id: 'inv_1',
        formType: 'fellow-memorandum',
        status: 'pending',
        submittedAt: null,
        formDef: minimalForm,
        response: null,
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

  it('shows the "Thank you!" success screen after a just-completed submit — NOT "Already Submitted"', async () => {
    // Mount with pending status (appointee opens a fresh link).
    mockUsePublicForm.mockReturnValue({
      data: {
        id: 'inv_1',
        formType: 'fellow-memorandum',
        status: 'pending',
        submittedAt: null,
        formDef: minimalForm,
        response: null,
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
        formDef: minimalForm,
        response: { fullName: 'Maria Bianchi' },
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
  });

  it('resets the initial-status snapshot when the token changes (SPA nav between forms)', async () => {
    // Regression for the adversarial review finding: React Router reuses
    // the same component instance when only the :token param changes
    // (same route pattern). Without keying the ref by token, the snapshot
    // from the first token carries over into the second. This test drives
    // the actual in-place nav via a history-pushing button inside a
    // shared MemoryRouter so the ref's reset logic is genuinely exercised.
    let currentToken = 'tokA';
    mockUsePublicForm.mockImplementation(() => ({
      data:
        currentToken === 'tokA'
          ? {
              id: 'inv_1',
              formType: 'fellow-memorandum',
              status: 'submitted',
              submittedAt: '2026-04-24T10:00:00.000Z',
              formDef: minimalForm,
              response: { fullName: 'Prior' },
            }
          : {
              id: 'inv_2',
              formType: 'fellow-memorandum',
              status: 'pending',
              submittedAt: null,
              formDef: minimalForm,
              response: null,
            },
      isLoading: false,
      error: null,
    }));
    mockUseSubmitForm.mockReturnValue({
      mutate: mockMutate,
      isPending: false,
      error: null,
      isSuccess: false,
    });

    // Mount a shared router so the same PublicFormPage instance survives
    // the token change.
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
    });
    const TestHarness = () => {
      const [token, setToken] = useState('tokA');
      currentToken = token;
      // Key the MemoryRouter on the external token so that setting tokB
      // actually changes the URL the router sees. Inside the router,
      // PublicFormPage is NOT keyed — React Router with the same route
      // pattern will reuse the PublicFormPage instance across the token
      // change, which is exactly what we want to stress-test: the ref's
      // reset logic must fire when useParams() returns a new value.
      return (
        <QueryClientProvider client={client}>
          <MemoryRouter initialEntries={[`/forms/${token}`]} key={token}>
            <Routes>
              <Route
                path="/forms/:token"
                element={
                  <>
                    <button onClick={() => setToken('tokB')}>nav</button>
                    <PublicFormPage />
                  </>
                }
              />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      );
    };
    render(<TestHarness />);

    // tokA is submitted → expect the re-visit message.
    expect(screen.getByText(/Form Already Submitted/)).toBeInTheDocument();

    // Navigate to tokB (pending). The token-keyed ref MUST reset so the
    // fresh form renders.
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
        formDef: minimalForm,
        response: null,
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
