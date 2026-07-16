export function getSafeReturnTo(requested: unknown): string {
  return typeof requested === 'string' && requested.startsWith('/') && !requested.startsWith('//')
    ? requested
    : '/dashboard';
}
