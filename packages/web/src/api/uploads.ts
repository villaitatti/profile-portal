import { apiUrl, useApiToken } from './client';

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
    const body = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(body.error || 'Image upload failed');
  }

  return response.json();
}

export function useUploadToken() {
  return useApiToken();
}
