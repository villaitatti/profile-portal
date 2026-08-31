import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { toast } from 'sonner';

const {
  mockUseMappings,
  mockUseRoles,
  mockUseAtlassianGroups,
  mockCreateMutate,
  mockDeleteMutate,
} = vi.hoisted(() => ({
  mockUseMappings: vi.fn(),
  mockUseRoles: vi.fn(),
  mockUseAtlassianGroups: vi.fn(),
  mockCreateMutate: vi.fn(),
  mockDeleteMutate: vi.fn(),
}));

vi.mock('@/api/sync', () => ({
  useMappings: mockUseMappings,
  useAtlassianGroups: mockUseAtlassianGroups,
  useCreateMapping: () => ({ mutate: mockCreateMutate, isPending: false }),
  useDeleteMapping: () => ({ mutate: mockDeleteMutate, isPending: false }),
}));

vi.mock('@/api/roles', () => ({ useRoles: mockUseRoles }));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { AtlassianMappingsPage } from '@/pages/admin/AtlassianMappingsPage';

const mapping = {
  id: 'map_1',
  auth0RoleId: 'rol_1',
  auth0RoleName: 'fellows',
  atlassianGroupId: 'grp_1',
  atlassianGroupName: 'fellows',
  createdBy: 'andrea',
  createdAt: '2026-05-01T10:00:00.000Z',
  updatedAt: '2026-05-01T10:00:00.000Z',
};

function renderPage() {
  return render(
    <MemoryRouter>
      <AtlassianMappingsPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  mockUseMappings.mockReturnValue({ data: [mapping], isLoading: false, error: null, refetch: vi.fn() });
  mockUseRoles.mockReturnValue({
    data: [{ id: 'rol_1', name: 'fellows' }],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  });
  mockUseAtlassianGroups.mockReturnValue({
    data: [{ id: 'grp_1', displayName: 'fellows' }],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  });
});

describe('AtlassianMappingsPage — load failures', () => {
  it('distinguishes a failed mappings query from an empty mapping list', () => {
    mockUseMappings.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('mappings 500'),
      refetch: vi.fn(),
    });

    renderPage();

    expect(screen.getByRole('alert')).toHaveTextContent(/Couldn't load the existing mappings/);
    expect(screen.queryByText(/No mappings configured/)).not.toBeInTheDocument();
    expect(screen.getByText(/The mapping list could not be loaded/)).toBeInTheDocument();
  });

  it('names each failing query in the banner', () => {
    mockUseRoles.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('roles 500'),
      refetch: vi.fn(),
    });
    mockUseAtlassianGroups.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('groups 500'),
      refetch: vi.fn(),
    });

    renderPage();

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('the Auth0 roles');
    expect(alert).toHaveTextContent('the Atlassian groups');
  });

  it('refetches only the failed query on Retry', async () => {
    const refetchMappings = vi.fn();
    const refetchRoles = vi.fn();
    mockUseMappings.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('mappings 500'),
      refetch: refetchMappings,
    });
    mockUseRoles.mockReturnValue({
      data: [{ id: 'rol_1', name: 'fellows' }],
      isLoading: false,
      error: null,
      refetch: refetchRoles,
    });

    renderPage();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Retry' }));

    expect(refetchMappings).toHaveBeenCalledOnce();
    expect(refetchRoles).not.toHaveBeenCalled();
  });
});

describe('AtlassianMappingsPage — mutation failures', () => {
  it('surfaces a duplicate-mapping rejection from Add Mapping', async () => {
    mockCreateMutate.mockImplementation(
      (_vars: unknown, opts: { onError: (err: Error) => void }) => {
        opts.onError(new Error('Mapping already exists'));
      }
    );

    const user = userEvent.setup();
    renderPage();

    // [0] is the Auth0 role combobox, [1] the Atlassian group one.
    await user.click(screen.getAllByRole('combobox')[0]);
    await user.click(screen.getByRole('option', { name: 'fellows' }));
    await user.click(screen.getAllByRole('combobox')[1]);
    await user.click(screen.getByRole('option', { name: 'fellows' }));
    await user.click(screen.getByRole('button', { name: /Add Mapping/ }));

    await waitFor(() => {
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith('Mapping already exists');
    });
  });

  it('surfaces a delete rejection and leaves the confirm dialog open', async () => {
    mockDeleteMutate.mockImplementation((_id: string, opts: { onError: (err: Error) => void }) => {
      opts.onError(new Error('Mapping is in use'));
    });

    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Remove mapping' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => {
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith('Mapping is in use');
    });
    // ConfirmDialog is a Base UI alert dialog, which exposes role="alertdialog".
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });
});
