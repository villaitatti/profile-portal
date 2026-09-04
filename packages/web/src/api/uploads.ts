import { ApiError, apiUrl, useApiToken } from './client';

export async function uploadImage(
  file: Blob,
  token: string
): Promise<{ url: string; blurPlaceholder: string }> {
  const formData = new FormData();
  formData.append('image', file);

  const response = await fetch(apiUrl('/api/admin/uploads/images'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  if (!response.ok) {
    // ApiError (not a bare Error) so lib/errors.ts can tell a user-appropriate
    // 4xx body ("File is too large…") from a server fault to translate away.
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    console.error(`[api] POST /api/admin/uploads/images failed with status ${response.status}`, body);
    throw new ApiError(
      response.status,
      (typeof body.error === 'string' && body.error) || 'Request failed',
      typeof body.code === 'string' ? body.code : undefined,
      body
    );
  }

  return response.json();
}

export function useUploadToken() {
  return useApiToken();
}
