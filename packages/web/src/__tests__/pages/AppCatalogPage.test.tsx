import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { toast } from 'sonner';
import type { Application } from '@itatti/shared';

const { mockUseApplications, mockDeleteMutateAsync } = vi.hoisted(() => ({
  mockUseApplications: vi.fn(),
  mockDeleteMutateAsync: vi.fn(),
}));

vi.mock('@/api/applications', () => ({
  useApplications: mockUseApplications,
  useDeleteApplication: () => ({ mutateAsync: mockDeleteMutateAsync, isPending: false }),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { AppCatalogPage } from '@/pages/admin/AppCatalogPage';

function makeApp(overrides: Partial<Application> & { id: number; name: string }): Application {
  return {
    description: '',
    url: `https://app-${overrides.id}.example.com`,
    loginMethod: 'vit-id',
    requiredRoles: ['fellows'],
    sortOrder: 0,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const mockApps: Application[] = [
  makeApp({
    id: 1,
    name: 'Grafana',
    url: 'https://grafana.example.com',
    requiredRoles: ['staff-IT'],
    sortOrder: 1,
  }),
  makeApp({
    id: 2,
    name: 'Library Catalog',
    url: 'https://library.example.com',
    requiredRoles: ['fellows', 'fellows-current'],
    sortOrder: 2,
  }),
];

function queryResult(overrides: Record<string, unknown> = {}) {
  return {
    data: mockApps,
    isLoading: false,
    error: null,
    isFetching: false,
    refetch: vi.fn(),
    ...overrides,
  };
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/admin/apps']}>
      <AppCatalogPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  mockUseApplications.mockReturnValue(queryResult());
  mockDeleteMutateAsync.mockResolvedValue(undefined);
});

// ─── Loading / Error / Empty ─────────────────────────────────────────────────

describe('AppCatalogPage — loading state', () => {
  it('shows skeleton blocks while loading', () => {
    mockUseApplications.mockReturnValue(queryResult({ data: undefined, isLoading: true }));

    const { container } = renderPage();

    expect(container.querySelectorAll('[class*="bg-muted"]').length).toBeGreaterThan(0);
    expect(screen.queryByText('Application Catalog')).not.toBeInTheDocument();
  });
});

describe('AppCatalogPage — error state', () => {
  it('announces the failure instead of showing an empty catalog', () => {
    mockUseApplications.mockReturnValue(
      queryResult({ data: undefined, error: new Error('500') })
    );

    renderPage();

    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load the catalog");
    expect(screen.queryByText('No applications yet')).not.toBeInTheDocument();
  });

  it('wires "Try again" to refetch', async () => {
    const result = queryResult({ data: undefined, error: new Error('500') });
    mockUseApplications.mockReturnValue(result);

    renderPage();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }));

    expect(result.refetch).toHaveBeenCalledTimes(1);
  });

  it('disables the retry button while refetching', () => {
    mockUseApplications.mockReturnValue(
      queryResult({ data: undefined, error: new Error('500'), isFetching: true })
    );

    renderPage();

    expect(screen.getByRole('button', { name: 'Trying again…' })).toBeDisabled();
  });
});

describe('AppCatalogPage — empty state', () => {
  it('shows the empty message with a link to add the first application', () => {
    mockUseApplications.mockReturnValue(queryResult({ data: [] }));

    renderPage();

    expect(screen.getByText('No applications yet')).toBeInTheDocument();
    // Header action + empty-state action both point to the create form.
    const addLinks = screen.getAllByRole('link', { name: 'Add Application' });
    expect(addLinks.length).toBe(2);
    for (const link of addLinks) {
      expect(link).toHaveAttribute('href', '/admin/apps/new');
    }
  });
});

// ─── Catalog table ───────────────────────────────────────────────────────────

describe('AppCatalogPage — catalog table', () => {
  it('lists each application with its URL, roles, and sort order', () => {
    renderPage();

    expect(screen.getByText('Grafana')).toBeInTheDocument();
    expect(screen.getByText('Library Catalog')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /grafana\.example\.com/ })).toHaveAttribute(
      'href',
      'https://grafana.example.com'
    );
    expect(screen.getByText('staff-IT')).toBeInTheDocument();
    expect(screen.getByText('fellows-current')).toBeInTheDocument();
  });

  it('links each row to its edit form', () => {
    renderPage();

    expect(screen.getByRole('link', { name: 'Edit Grafana' })).toHaveAttribute(
      'href',
      '/admin/apps/1/edit'
    );
    expect(screen.getByRole('link', { name: 'Edit Library Catalog' })).toHaveAttribute(
      'href',
      '/admin/apps/2/edit'
    );
  });
});

// ─── Delete flow ─────────────────────────────────────────────────────────────

describe('AppCatalogPage — delete flow', () => {
  it('confirms before deleting, then calls the mutation and reports success', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Delete Grafana' }));

    // Nothing is deleted until the admin confirms.
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('Delete Application')).toBeInTheDocument();
    expect(within(dialog).getByText('Delete "Grafana"? This cannot be undone.')).toBeInTheDocument();
    expect(mockDeleteMutateAsync).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() => {
      expect(mockDeleteMutateAsync).toHaveBeenCalledWith(1);
    });
    expect(vi.mocked(toast.success)).toHaveBeenCalledWith('Application deleted');
    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });
  });

  it('keeps the dialog open and surfaces a toast when the delete fails', async () => {
    mockDeleteMutateAsync.mockRejectedValue(new Error('constraint violation'));
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Delete Grafana' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() => {
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith('Failed to delete application');
    });
    // Dialog stays open so the admin can retry or cancel deliberately.
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });

  it('cancelling the dialog deletes nothing', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Delete Library Catalog' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });
    expect(mockDeleteMutateAsync).not.toHaveBeenCalled();
  });
});
