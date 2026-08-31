import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { toast } from 'sonner';
import type { Application } from '@itatti/shared';

const { mockUseApplication, mockCreateMutate, mockUpdateMutate } = vi.hoisted(() => ({
  mockUseApplication: vi.fn(),
  mockCreateMutate: vi.fn(),
  mockUpdateMutate: vi.fn(),
}));

vi.mock('@/api/applications', () => ({
  useApplication: mockUseApplication,
  useCreateApplication: () => ({ mutate: mockCreateMutate, isPending: false }),
  useUpdateApplication: () => ({ mutate: mockUpdateMutate, isPending: false }),
}));

// The real role list comes from Auth0; the RoleTagSelect combobox itself
// stays real so the test drives the actual role-picking workflow.
vi.mock('@/api/roles', () => ({
  useRoles: () => ({
    data: [
      { id: 'rol_1', name: 'staff-IT', description: 'IT staff' },
      { id: 'rol_2', name: 'fellows', description: 'All fellows' },
    ],
    isLoading: false,
  }),
}));

// The uploader crops/uploads through the API; a shallow stub that reports a
// finished upload is enough to prove the form wires the result into the payload.
vi.mock('@/pages/admin/components/ImageUploader', () => ({
  ImageUploader: ({ onChange }: { onChange: (url: string, blur?: string) => void }) => (
    <button type="button" onClick={() => onChange('https://cdn.example/pic.png', 'blur-data')}>
      Mock upload image
    </button>
  ),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { AppFormPage } from '@/pages/admin/AppFormPage';

const existingApp: Application = {
  id: 7,
  name: 'Grafana',
  description: 'Dashboards',
  url: 'https://grafana.example.com',
  imageUrl: '',
  loginMethod: 'vit-id',
  requiredRoles: ['staff-IT'],
  sortOrder: 3,
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function renderPage(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/admin/apps/new" element={<AppFormPage />} />
        <Route path="/admin/apps/:id/edit" element={<AppFormPage />} />
        <Route path="/admin/apps" element={<div>Catalog destination</div>} />
      </Routes>
    </MemoryRouter>
  );
}

/** Fills the minimum valid create form: name, URL, and one visible-to role. */
async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Application name'), 'Grafana');
  await user.type(screen.getByLabelText('Application URL'), 'https://grafana.example.com');
  await user.click(screen.getByRole('combobox'));
  await user.click(await screen.findByRole('option', { name: /staff-IT/ }));
}

beforeEach(() => {
  vi.resetAllMocks();
  mockUseApplication.mockReturnValue({ data: undefined, isLoading: false });
});

// ─── Create mode ─────────────────────────────────────────────────────────────

describe('AppFormPage — create mode', () => {
  it('renders the create header, empty fields, and a back link to the catalog', () => {
    renderPage('/admin/apps/new');

    expect(screen.getByRole('heading', { level: 1, name: 'Add Application' })).toBeInTheDocument();
    expect(screen.getByLabelText('Application name')).toHaveValue('');
    expect(screen.getByLabelText('Application URL')).toHaveValue('');
    expect(screen.getByRole('link', { name: /Back to catalog/ })).toHaveAttribute(
      'href',
      '/admin/apps'
    );
    expect(screen.getByRole('button', { name: 'Create Application' })).toBeInTheDocument();
  });

  it('shows validation errors on empty submit and does not call the mutation', async () => {
    const user = userEvent.setup();
    renderPage('/admin/apps/new');

    await user.click(screen.getByRole('button', { name: 'Create Application' }));

    expect(await screen.findByText('Name is required')).toBeInTheDocument();
    expect(screen.getByText('Please enter a valid URL')).toBeInTheDocument();
    expect(screen.getByText('Select at least one role')).toBeInTheDocument();
    expect(mockCreateMutate).not.toHaveBeenCalled();
  });

  it('clears the URL error once a valid URL is entered', async () => {
    const user = userEvent.setup();
    renderPage('/admin/apps/new');

    await user.click(screen.getByRole('button', { name: 'Create Application' }));
    expect(await screen.findByText('Please enter a valid URL')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Application URL'), 'https://ok.example.com');
    await user.click(screen.getByRole('button', { name: 'Create Application' }));

    await waitFor(() => {
      expect(screen.queryByText('Please enter a valid URL')).not.toBeInTheDocument();
    });
  });

  it('submits a valid form, calls the create mutation, and navigates back to the catalog', async () => {
    mockCreateMutate.mockImplementation((_input: unknown, opts: { onSuccess: () => void }) => {
      opts.onSuccess();
    });
    const user = userEvent.setup();
    renderPage('/admin/apps/new');

    await fillValidForm(user);
    // Selected role shows up as a removable pill.
    expect(screen.getByRole('button', { name: 'Remove staff-IT' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Create Application' }));

    await waitFor(() => {
      expect(mockCreateMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Grafana',
          url: 'https://grafana.example.com',
          requiredRoles: ['staff-IT'],
          loginMethod: 'vit-id',
          imageUrl: undefined,
        }),
        expect.anything()
      );
    });
    expect(vi.mocked(toast.success)).toHaveBeenCalledWith('Application created');
    expect(await screen.findByText('Catalog destination')).toBeInTheDocument();
  });

  it('includes the uploaded image in the payload', async () => {
    mockCreateMutate.mockImplementation((_input: unknown, opts: { onSuccess: () => void }) => {
      opts.onSuccess();
    });
    const user = userEvent.setup();
    renderPage('/admin/apps/new');

    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: 'Mock upload image' }));
    await user.click(screen.getByRole('button', { name: 'Create Application' }));

    await waitFor(() => {
      expect(mockCreateMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          imageUrl: 'https://cdn.example/pic.png',
          blurPlaceholder: 'blur-data',
        }),
        expect.anything()
      );
    });
  });

  it('stays on the form and shows an error toast when the create fails', async () => {
    mockCreateMutate.mockImplementation((_input: unknown, opts: { onError: () => void }) => {
      opts.onError();
    });
    const user = userEvent.setup();
    renderPage('/admin/apps/new');

    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: 'Create Application' }));

    await waitFor(() => {
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith('Failed to create application');
    });
    expect(screen.queryByText('Catalog destination')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Add Application' })).toBeInTheDocument();
  });
});

// ─── Edit mode ───────────────────────────────────────────────────────────────

describe('AppFormPage — edit mode', () => {
  beforeEach(() => {
    mockUseApplication.mockReturnValue({ data: existingApp, isLoading: false });
  });

  it('shows a skeleton while the application loads', () => {
    mockUseApplication.mockReturnValue({ data: undefined, isLoading: true });

    const { container } = renderPage('/admin/apps/7/edit');

    expect(container.querySelectorAll('[class*="bg-muted"]').length).toBeGreaterThan(0);
    expect(screen.queryByText('Edit Application')).not.toBeInTheDocument();
  });

  it('prefills the form with the existing application', () => {
    renderPage('/admin/apps/7/edit');

    expect(screen.getByRole('heading', { level: 1, name: 'Edit Application' })).toBeInTheDocument();
    expect(screen.getByLabelText('Application name')).toHaveValue('Grafana');
    expect(screen.getByLabelText('Application URL')).toHaveValue('https://grafana.example.com');
    expect(screen.getByLabelText('Sort order')).toHaveValue(3);
    expect(screen.getByRole('button', { name: 'Remove staff-IT' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Update Application' })).toBeInTheDocument();
  });

  it('submits changes through the update mutation and navigates on success', async () => {
    mockUpdateMutate.mockImplementation((_input: unknown, opts: { onSuccess: () => void }) => {
      opts.onSuccess();
    });
    const user = userEvent.setup();
    renderPage('/admin/apps/7/edit');

    const nameInput = screen.getByLabelText('Application name');
    await user.clear(nameInput);
    await user.type(nameInput, 'Grafana Cloud');
    await user.click(screen.getByRole('button', { name: 'Update Application' }));

    await waitFor(() => {
      expect(mockUpdateMutate).toHaveBeenCalledWith(
        expect.objectContaining({ id: 7, name: 'Grafana Cloud', requiredRoles: ['staff-IT'] }),
        expect.anything()
      );
    });
    expect(vi.mocked(toast.success)).toHaveBeenCalledWith('Application updated');
    expect(await screen.findByText('Catalog destination')).toBeInTheDocument();
  });

  it('stays on the form and shows an error toast when the update fails', async () => {
    mockUpdateMutate.mockImplementation((_input: unknown, opts: { onError: () => void }) => {
      opts.onError();
    });
    const user = userEvent.setup();
    renderPage('/admin/apps/7/edit');

    await user.click(screen.getByRole('button', { name: 'Update Application' }));

    await waitFor(() => {
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith('Failed to update application');
    });
    expect(screen.queryByText('Catalog destination')).not.toBeInTheDocument();
  });
});
