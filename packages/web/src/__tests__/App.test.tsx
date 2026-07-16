import { describe, expect, it } from 'vitest';
import { getSafeReturnTo } from '@/config/auth-redirect';

describe('getSafeReturnTo', () => {
  it('keeps same-origin relative paths including query and hash', () => {
    expect(getSafeReturnTo('/profile?tab=contact#phones')).toBe('/profile?tab=contact#phones');
  });

  it.each(['https://attacker.example', '//attacker.example', '', undefined, null])(
    'falls back for an unsafe callback path: %s',
    (value) => {
      expect(getSafeReturnTo(value)).toBe('/dashboard');
    }
  );
});
