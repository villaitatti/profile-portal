import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const { mockUseAuth0, mockGetAccessTokenSilently, mockLoginWithRedirect } = vi.hoisted(() => ({
  mockUseAuth0: vi.fn(),
  mockGetAccessTokenSilently: vi.fn(),
  mockLoginWithRedirect: vi.fn(),
}));

vi.mock('@auth0/auth0-react', () => ({ useAuth0: mockUseAuth0 }));
vi.mock('@/config/auth0', () => ({ auth0Config: { audience: 'https://api.itatti' } }));
vi.mock('@/config/runtime', () => ({ getApiBaseUrl: () => '' }));

import { useApiToken } from '@/api/client';

beforeEach(() => {
  vi.resetAllMocks();
  mockUseAuth0.mockReturnValue({
    getAccessTokenSilently: mockGetAccessTokenSilently,
    loginWithRedirect: mockLoginWithRedirect,
  });
  mockLoginWithRedirect.mockResolvedValue(undefined);
});

describe('useApiToken', () => {
  it('requests the API audience', async () => {
    mockGetAccessTokenSilently.mockResolvedValue('jwt');

    const { result } = renderHook(() => useApiToken());

    await expect(result.current()).resolves.toBe('jwt');
    expect(mockGetAccessTokenSilently).toHaveBeenCalledWith({
      authorizationParams: { audience: 'https://api.itatti' },
    });
    expect(mockLoginWithRedirect).not.toHaveBeenCalled();
  });

  it.each(['login_required', 'consent_required', 'interaction_required', 'missing_refresh_token'])(
    'starts an interactive login when silent renewal fails with %s',
    async (code) => {
      // Without this the expired in-memory token surfaces as a generic failure
      // on every query and the session never recovers.
      mockGetAccessTokenSilently.mockRejectedValue(Object.assign(new Error(code), { error: code }));

      const { result } = renderHook(() => useApiToken());

      await expect(result.current()).rejects.toThrow(code);
      expect(mockLoginWithRedirect).toHaveBeenCalledWith({
        appState: { returnTo: expect.any(String) },
      });
    }
  );

  it('does not redirect for unrelated failures', async () => {
    mockGetAccessTokenSilently.mockRejectedValue(new Error('network down'));

    const { result } = renderHook(() => useApiToken());

    await expect(result.current()).rejects.toThrow('network down');
    expect(mockLoginWithRedirect).not.toHaveBeenCalled();
  });
});
