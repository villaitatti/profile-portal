import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { ReactNode } from 'react';

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
    // Label includes a required asterisk; match by textbox role + index instead.
    const nameInput = screen.getByRole('textbox');
    await user.type(nameInput, 'Maria Bianchi');
    await user.click(screen.getByRole('button', { name: /Submit/ }));

    expect(mockMutate).toHaveBeenCalledWith({ fullName: 'Maria Bianchi' });
  });
});
