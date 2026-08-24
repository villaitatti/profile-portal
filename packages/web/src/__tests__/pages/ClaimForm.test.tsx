import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ClaimForm } from '@/pages/claim/ClaimForm';
import { apiFetch, ApiError } from '@/api/client';

vi.mock('@/api/client', async () => {
  const actual = await vi.importActual<typeof import('@/api/client')>('@/api/client');
  return { ...actual, apiFetch: vi.fn() };
});

const mockApiFetch = vi.mocked(apiFetch);

beforeEach(() => {
  vi.resetAllMocks();
});

async function submitEmail(email = 'fellow@example.com') {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Email address'), email);
  await user.click(screen.getByRole('button', { name: /Claim VIT ID/ }));
}

describe('ClaimForm', () => {
  it('shows the generic confirmation on success', async () => {
    mockApiFetch.mockResolvedValue({} as Response);

    render(<ClaimForm />);
    await submitEmail();

    await waitFor(() => expect(screen.getByText('Request Submitted')).toBeInTheDocument());
  });

  it.each([
    [404, 'not eligible'],
    [409, 'already claimed'],
    [429, 'rate limited'],
    [500, 'boom'],
  ])('masks a %s server response behind the confirmation (anti-enumeration)', async (status, message) => {
    mockApiFetch.mockRejectedValue(new ApiError(status, message));

    render(<ClaimForm />);
    await submitEmail();

    await waitFor(() => expect(screen.getByText('Request Submitted')).toBeInTheDocument());
    // No status code, no server message — the caller must not learn whether
    // this address is eligible.
    expect(screen.queryByText(new RegExp(String(status)))).not.toBeInTheDocument();
    expect(screen.queryByText(new RegExp(message, 'i'))).not.toBeInTheDocument();
  });

  it('reports a transport failure instead of claiming the request was submitted', async () => {
    // A fetch TypeError means the request never left the browser: offline, DNS
    // or CORS. Claiming "Request Submitted" would be a lie, and nothing about
    // the address leaks by saying so.
    mockApiFetch.mockRejectedValue(new TypeError('Failed to fetch'));

    render(<ClaimForm />);
    await submitEmail();

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        "We couldn't reach the server — check your connection and try again."
      )
    );
    expect(screen.queryByText('Request Submitted')).not.toBeInTheDocument();
    // The form stays up so the appointee can retry.
    expect(screen.getByRole('button', { name: /Claim VIT ID/ })).toBeEnabled();
  });

  it('clears a previous transport error on the next attempt', async () => {
    mockApiFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    mockApiFetch.mockResolvedValueOnce({} as Response);

    render(<ClaimForm />);
    await submitEmail();
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());

    await userEvent.setup().click(screen.getByRole('button', { name: /Claim VIT ID/ }));

    await waitFor(() => expect(screen.getByText('Request Submitted')).toBeInTheDocument());
  });
});
