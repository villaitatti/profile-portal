import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
  active: false,
  appointmentTypes: ['Fellow'],
  sections: [
    {
      title: 'Personal',
      fields: [{ name: 'fullName', label: 'Full name', type: 'text', required: true }],
    },
  ],
};

// Registry order mirrors the real one: oldest → newest. Mirroring reality, all
// three versions share the identical title — they're told apart only by id, so
// the tests assert on id (the on-card disambiguator), not title.
const fellowMemoV2: FormDef = {
  ...fellowMemo,
  id: 'fellow-memorandum-v2',
  active: false,
};
const fellowMemoV3: FormDef = {
  ...fellowMemo,
  id: 'fellow-memorandum-v3',
  active: true,
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
  it('renders the Forms header with section navigation', () => {
    mockUseFormRegistry.mockReturnValue({ data: [fellowMemoV3], isLoading: false });

    render(<FormsTemplatesPage />, { wrapper: makeWrapper() });

    expect(screen.getByRole('heading', { name: 'Forms' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Forms views' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Submissions' })).toHaveAttribute(
      'href',
      '/admin/forms'
    );
    expect(screen.getByRole('link', { name: 'Templates' })).toHaveAttribute(
      'href',
      '/admin/forms/templates'
    );
  });

  it('renders each active form with its title on the default tab', () => {
    mockUseFormRegistry.mockReturnValue({ data: [fellowMemoV3], isLoading: false });

    render(<FormsTemplatesPage />, { wrapper: makeWrapper() });

    expect(screen.getByText('Memorandum I Tatti Fellowship')).toBeInTheDocument();
    expect(screen.getByText('Full name')).toBeInTheDocument();
  });

  it('disambiguates same-titled versions by showing the registry id', () => {
    mockUseFormRegistry.mockReturnValue({
      data: [fellowMemo, fellowMemoV2, fellowMemoV3],
      isLoading: false,
    });

    render(<FormsTemplatesPage />, { wrapper: makeWrapper() });

    // All three share the title, so the id is the only on-card differentiator.
    expect(screen.getByText('fellow-memorandum-v3')).toBeInTheDocument();
  });

  it('defaults to the Active tab and hides retired templates', () => {
    mockUseFormRegistry.mockReturnValue({
      data: [fellowMemo, fellowMemoV2, fellowMemoV3],
      isLoading: false,
    });

    render(<FormsTemplatesPage />, { wrapper: makeWrapper() });

    const tabs = screen.getByRole('navigation', { name: 'Template status' });
    expect(within(tabs).getByRole('button', { name: /Active/ })).toHaveAttribute(
      'aria-pressed',
      'true'
    );

    // Active tab shows only the active v3 template (by id); the two retired ones
    // (v1, v2) are hidden.
    expect(screen.getByText('fellow-memorandum-v3')).toBeInTheDocument();
    expect(screen.queryByText('fellow-memorandum-v2')).not.toBeInTheDocument();
    expect(screen.queryByText('fellow-memorandum')).not.toBeInTheDocument();
  });

  it('shows retired templates newest-first when the Retired tab is selected', async () => {
    const user = userEvent.setup();
    mockUseFormRegistry.mockReturnValue({
      data: [fellowMemo, fellowMemoV2, fellowMemoV3],
      isLoading: false,
    });

    render(<FormsTemplatesPage />, { wrapper: makeWrapper() });

    const tabs = screen.getByRole('navigation', { name: 'Template status' });
    await user.click(within(tabs).getByRole('button', { name: /Retired/ }));

    // v2 (newer) should appear before v1 (older) in the DOM. Titles are
    // identical across versions, so assert order via the id disambiguator.
    const ids = screen
      .getAllByText(/^fellow-memorandum/)
      .map((el) => el.textContent);
    expect(ids).toEqual(['fellow-memorandum-v2', 'fellow-memorandum']);
    expect(screen.queryByText('fellow-memorandum-v3')).not.toBeInTheDocument();
  });

  it('renders the active empty state when the registry has no templates', () => {
    mockUseFormRegistry.mockReturnValue({ data: [], isLoading: false });

    render(<FormsTemplatesPage />, { wrapper: makeWrapper() });

    expect(screen.getByText('No active templates')).toBeInTheDocument();
  });

  it('renders the retired empty state when only active templates exist', async () => {
    const user = userEvent.setup();
    mockUseFormRegistry.mockReturnValue({ data: [fellowMemoV3], isLoading: false });

    render(<FormsTemplatesPage />, { wrapper: makeWrapper() });

    const tabs = screen.getByRole('navigation', { name: 'Template status' });
    await user.click(within(tabs).getByRole('button', { name: /Retired/ }));

    expect(screen.getByText('No retired templates')).toBeInTheDocument();
  });

  it('shows section descriptions and field help text so staff can read the guidance', () => {
    const guidanceForm: FormDef = {
      id: 'guidance-form',
      title: 'Guidance Form',
      active: true,
      appointmentTypes: ['Fellow'],
      sections: [
        {
          title: 'Grant Information',
          description: 'The base grant is paid either directly to the Fellow or to the institution.',
          fields: [
            {
              name: 'resources',
              label: 'Resources for the fellowship year',
              type: 'textarea',
              required: true,
              helpText: 'Please describe all financial resources available to you.',
            },
            {
              name: 'additionalInfo',
              label: 'Additional information',
              type: 'textarea',
              required: false,
              helpText: 'Please indicate any special circumstances or difficulties.',
            },
          ],
        },
      ],
    };

    mockUseFormRegistry.mockReturnValue({ data: [guidanceForm], isLoading: false });

    render(<FormsTemplatesPage />, { wrapper: makeWrapper() });

    expect(
      screen.getByText('The base grant is paid either directly to the Fellow or to the institution.')
    ).toBeInTheDocument();
    expect(
      screen.getByText('Please describe all financial resources available to you.')
    ).toBeInTheDocument();
    expect(
      screen.getByText('Please indicate any special circumstances or difficulties.')
    ).toBeInTheDocument();
  });

  it('surfaces help text from repeatable-group children', () => {
    const familyForm: FormDef = {
      id: 'family-form',
      title: 'Family Form',
      active: true,
      appointmentTypes: ['Fellow'],
      sections: [
        {
          title: 'Family',
          fields: [
            {
              name: 'children',
              label: 'Children',
              type: 'repeatable-group',
              required: false,
              fields: [
                {
                  name: 'fullName',
                  label: 'Full name',
                  type: 'text',
                  required: true,
                  helpText: 'Use the legal name exactly as it appears on the passport.',
                },
              ],
            },
          ],
        },
      ],
    };

    mockUseFormRegistry.mockReturnValue({ data: [familyForm], isLoading: false });

    render(<FormsTemplatesPage />, { wrapper: makeWrapper() });

    expect(
      screen.getByText('Use the legal name exactly as it appears on the passport.')
    ).toBeInTheDocument();
  });
});
