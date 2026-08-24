import { QueryClient } from '@tanstack/react-query';

const MAX_RETRIES = 1;

/**
 * Reads the HTTP status off an ApiError / PublicFormRequestError by shape
 * instead of importing them: `@/api/client` pulls in the Auth0 SDK, which must
 * stay out of the app-shell chunk that loads this module.
 */
function httpStatusOf(error: unknown): number | undefined {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === 'number' ? status : undefined;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      // 4xx answers are deterministic — unauthorized, forbidden, not found —
      // so a retry only delays the error the user needs to see. Mirrors the
      // per-query policy in usePublicForm.
      retry: (failureCount, error) => {
        const status = httpStatusOf(error);
        if (status !== undefined && status >= 400 && status < 500) return false;
        return failureCount < MAX_RETRIES;
      },
    },
  },
});
