import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';

const { mockUseFormRegistry } = vi.hoisted(() => ({
  mockUseFormRegistry: vi.fn(),
}));

vi.mock('@/api/forms', () => ({
  useFormRegistry: mockUseFormRegistry,
}));

import { FormsTemplatesPage } from '@/pages/admin/FormsTemplatesPage';
import type { FormDef } from '@itatti/shared';

const fellowMemo: FormDef = {
  id: 'fellow-memorandum',
  title: 'Memorandum I Tatti Fellowship',
  appointmentTypes: ['Fellow'],
  sections: [
    {
      title: 'Personal',
      fields: [{ name: 'fullName', label: 'Full name', type: 'text', required: true }],
    },
  ],
};

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/admin/forms/templates']}>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('FormsTemplatesPage', () => {
  it('renders the page header with a "Submissions" back link', () => {
    mockUseFormRegistry.mockReturnValue({ data: [fellowMemo], isLoading: false });

    render(<FormsTemplatesPage />, { wrapper: makeWrapper() });

    expect(screen.getByRole('heading', { name: /Form Templates/ })).toBeInTheDocument();
    const backLink = screen.getByRole('link', { name: /Submissions/ });
    expect(backLink).toHaveAttribute('href', '/admin/forms');
  });

  it('renders each form in the registry with its title', () => {
    mockUseFormRegistry.mockReturnValue({ data: [fellowMemo], isLoading: false });

    render(<FormsTemplatesPage />, { wrapper: makeWrapper() });

    expect(screen.getByText('Memorandum I Tatti Fellowship')).toBeInTheDocument();
    expect(screen.getByText('Full name')).toBeInTheDocument();
  });
});
