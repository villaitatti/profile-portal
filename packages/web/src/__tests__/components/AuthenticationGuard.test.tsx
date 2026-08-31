import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';

const { mockLoginWithRedirect, mockUseAuth0 } = vi.hoisted(() => ({
  mockLoginWithRedirect: vi.fn(),
  mockUseAuth0: vi.fn(),
}));

vi.mock('@auth0/auth0-react', () => ({ useAuth0: mockUseAuth0 }));

import { AuthenticationGuard } from '@/components/auth/AuthenticationGuard';

function renderGuard(path = '/admin/forms?year=2026#archive') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<AuthenticationGuard />}>
          <Route path="*" element={<div>Protected content</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

describe('AuthenticationGuard', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockUseAuth0.mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
      loginWithRedirect: mockLoginWithRedirect,
    });
  });

  it('preserves the complete protected deep link for the Auth0 callback', async () => {
    mockLoginWithRedirect.mockResolvedValue(undefined);
    renderGuard();

    await waitFor(() =>
      expect(mockLoginWithRedirect).toHaveBeenCalledWith({
        appState: { returnTo: '/admin/forms?year=2026#archive' },
      })
    );
  });

  it('shows a recoverable error when Auth0 redirect setup fails', async () => {
    mockLoginWithRedirect.mockRejectedValue(new Error('network down'));
    renderGuard('/profile');

    expect(await screen.findByRole('heading', { name: 'Sign-in unavailable' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();

    mockLoginWithRedirect.mockResolvedValue(undefined);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(mockLoginWithRedirect).toHaveBeenCalledTimes(2));
  });
});
