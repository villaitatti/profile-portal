import { describe, expect, it } from 'vitest';
import i18n from 'i18next';
import { ApiError } from '@/api/client';
import { httpStatusOf, userErrorMessage } from '@/lib/errors';

// i18n is initialized (English) by src/test/setup.ts.
const t = i18n.t.bind(i18n);

describe('userErrorMessage', () => {
  it('passes a server-authored 4xx message through (those are written for users)', () => {
    const err = new ApiError(409, 'You already have a Home address for this year.', 'CONFLICT', {
      error: 'You already have a Home address for this year.',
    });

    expect(userErrorMessage(err, t)).toBe('You already have a Home address for this year.');
  });

  it('never shows the client-side placeholder when a 4xx body carried no message', () => {
    // apiFetch falls back to "Request failed" when the body has no `error`
    // field (e.g. a non-JSON 404 from a proxy) — that must not reach the user.
    const err = new ApiError(404, 'Request failed', undefined, {});

    expect(userErrorMessage(err, t)).toBe('An unexpected error occurred. Please try again.');
    expect(userErrorMessage(err, t, 'The item could not be loaded.')).toBe(
      'The item could not be loaded.'
    );
  });

  it('replaces auth middleware messages on 401 and 403 with translated copy', () => {
    const unauthorized = new ApiError(401, 'jwt expired', 'UNAUTHORIZED', { error: 'jwt expired' });
    const forbidden = new ApiError(403, 'Forbidden', 'FORBIDDEN', { error: 'Forbidden' });

    expect(userErrorMessage(unauthorized, t)).toBe('Your session has expired. Sign in again and retry.');
    expect(userErrorMessage(forbidden, t)).toBe(
      'Your account is not allowed to perform this action. If you think it should be, contact IT.'
    );
  });

  it('hides 5xx bodies behind the generic server message or the caller fallback', () => {
    const err = new ApiError(500, 'Internal Server Error', 'INTERNAL_ERROR', {
      error: 'Internal Server Error',
    });

    expect(userErrorMessage(err, t)).toBe(
      'Something went wrong while processing the request. Try again in a moment; if the problem continues, contact IT.'
    );
    expect(userErrorMessage(err, t, 'The address could not be saved.')).toBe(
      'The address could not be saved.'
    );
  });

  it('maps fetch network failures (TypeError) to the connection message', () => {
    expect(userErrorMessage(new TypeError('Failed to fetch'), t)).toBe(
      'The server could not be reached. Check your internet connection and try again.'
    );
  });

  it('maps unknown errors to the fallback or the generic message', () => {
    expect(userErrorMessage(new Error('boom'), t)).toBe(
      'An unexpected error occurred. Please try again.'
    );
    expect(userErrorMessage('boom', t)).toBe('An unexpected error occurred. Please try again.');
    expect(userErrorMessage(new Error('boom'), t, 'Failed to send email.')).toBe(
      'Failed to send email.'
    );
  });

  it('translates the generic messages', async () => {
    await i18n.changeLanguage('it');
    try {
      expect(userErrorMessage(new TypeError('Failed to fetch'), t)).toBe(
        'Impossibile raggiungere il server. Controlla la connessione a internet e riprova.'
      );
    } finally {
      await i18n.changeLanguage('en');
    }
  });
});

describe('httpStatusOf', () => {
  it('reads the status off ApiError-shaped values and nothing else', () => {
    expect(httpStatusOf(new ApiError(404, 'Not found'))).toBe(404);
    expect(httpStatusOf(new Error('boom'))).toBeUndefined();
    expect(httpStatusOf({ status: 404 })).toBeUndefined();
    expect(httpStatusOf(undefined)).toBeUndefined();
  });
});
