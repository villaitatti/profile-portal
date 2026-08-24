/**
 * One consistent way to turn an unknown thrown value into a user-facing string.
 *
 * Every admin action that surfaces a failure needs this, and inline
 * `err instanceof Error ? err.message : '...'` ternaries drifted apart ("Unexpected
 * error" vs "unexpected error"). Shared so the fallback wording is identical
 * everywhere.
 */
export function getErrorMessage(err: unknown, fallback = 'Unexpected error'): string {
  return err instanceof Error && err.message ? err.message : fallback;
}
