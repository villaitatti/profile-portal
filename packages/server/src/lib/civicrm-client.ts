import { env } from '../env.js';

export interface CiviApiResponse {
  values: Record<string, unknown>[];
}

export async function civiApiCall(
  entity: string,
  action: string,
  params: Record<string, unknown>
): Promise<CiviApiResponse> {
  const url = `${env.CIVICRM_BASE_URL}/civicrm/ajax/api4/${entity}/${action}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
  };

  if (env.CIVICRM_SITE_KEY) {
    headers['Authorization'] = `Bearer ${env.CIVICRM_API_KEY}`;
    headers['X-Civi-Key'] = env.CIVICRM_SITE_KEY;
  } else {
    headers['X-Civi-Auth'] = `Bearer ${env.CIVICRM_API_KEY}`;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: `params=${encodeURIComponent(JSON.stringify(params))}`,
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`CiviCRM API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as CiviApiResponse & { error_message?: string };
  if (data.error_message) {
    throw new Error(`CiviCRM API error: ${data.error_message}`);
  }

  return data;
}
