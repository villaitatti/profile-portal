import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const { mockUseAuth0, mockLoginWithRedirect } = vi.hoisted(() => ({
  mockUseAuth0: vi.fn(),
  mockLoginWithRedirect: vi.fn(),
}));

vi.mock('@auth0/auth0-react', () => ({ useAuth0: mockUseAuth0 }));

import { CallbackPage } from '@/components/auth/CallbackPage';

function renderCallback() {
  return render(
    <MemoryRouter initialEntries={['/callback']}>
      <Routes>
        <Route path="/callback" element={<CallbackPage />} />
        <Route path="/dashboard" element={<p>dashboard</p>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  mockLoginWithRedirect.mockResolvedValue(undefined);
});

describe('CallbackPage', () => {
  it('shows the Auth0 error description with a way back to sign in', async () => {
    const error = Object.assign(new Error('access_denied'), {
      error: 'access_denied',
      error_description: 'You are not allowed to access this application.',
    });
    mockUseAuth0.mockReturnValue({
      error,
      isLoading: false,
      isAuthenticated: false,
      loginWithRedirect: mockLoginWithRedirect,
    });

    renderCallback();

    expect(screen.getByRole('heading', { name: 'Sign-in could not be completed' })).toBeInTheDocument();
    expect(screen.getByText('You are not allowed to access this application.')).toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole('button', { name: 'Return to sign in' }));
    expect(mockLoginWithRedirect).toHaveBeenCalledOnce();
  });

  it('falls back to the error message when no description is supplied', () => {
    mockUseAuth0.mockReturnValue({
      error: new Error('Invalid state'),
      isLoading: false,
      isAuthenticated: false,
      loginWithRedirect: mockLoginWithRedirect,
    });

    renderCallback();

    expect(screen.getByText('Invalid state')).toBeInTheDocument();
  });

  it('holds the spinner while the SDK exchanges the code', () => {
    mockUseAuth0.mockReturnValue({
      error: undefined,
      isLoading: true,
      isAuthenticated: false,
      loginWithRedirect: mockLoginWithRedirect,
    });

    renderCallback();

    expect(screen.getByRole('status', { name: 'Loading page' })).toBeInTheDocument();
    expect(screen.queryByText('dashboard')).not.toBeInTheDocument();
  });

  it('leaves /callback when there is no code, state or error (refresh or bookmark)', () => {
    // This route sits outside AuthenticationGuard, so without this redirect the
    // user waits on an infinite spinner and nothing ever starts a login.
    mockUseAuth0.mockReturnValue({
      error: undefined,
      isLoading: false,
      isAuthenticated: false,
      loginWithRedirect: mockLoginWithRedirect,
    });

    renderCallback();

    expect(screen.getByText('dashboard')).toBeInTheDocument();
  });
});
