import { env } from '../env.js';

export interface CiviApiResponse {
  values: Record<string, unknown>[];
}

/**
 * Marker for failures that originate at the CiviCRM HTTP boundary — transport
 * errors (DNS, refused connection, the 10s timeout) and API-level error
 * responses. parseCiviCRMError classifies ONLY instances of this class;
 * anything else is a local bug and must surface as a 500, not as "CiviCRM is
 * temporarily unavailable, try again".
 */
export class CiviCRMApiError extends Error {
  /** True when the request never produced an API response (network/timeout). */
  readonly transport: boolean;

  constructor(message: string, opts: { transport?: boolean; cause?: unknown } = {}) {
    super(message, opts.cause !== undefined ? { cause: opts.cause } : undefined);
    this.name = 'CiviCRMApiError';
    this.transport = opts.transport ?? false;
  }
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

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers,
      body: `params=${encodeURIComponent(JSON.stringify(params))}`,
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    // fetch rejects on DNS failure, refused connection, or the AbortSignal
    // timeout — the request never reached CiviCRM.
    throw new CiviCRMApiError(
      `CiviCRM request failed: ${err instanceof Error ? err.message : String(err)}`,
      { transport: true, cause: err }
    );
  }

  if (!response.ok) {
    throw new CiviCRMApiError(
      `CiviCRM API error: ${entity}.${action} returned ${response.status} ${response.statusText}`
    );
  }

  let data: CiviApiResponse & { error_message?: string };
  try {
    data = (await response.json()) as CiviApiResponse & { error_message?: string };
  } catch (err) {
    // A 200 with a non-JSON body is CiviCRM handing back an HTML error or
    // login page — an upstream fault, not ours.
    throw new CiviCRMApiError(`CiviCRM returned a non-JSON response for ${entity}.${action}`, {
      transport: true,
      cause: err,
    });
  }
  if (data.error_message) {
    throw new CiviCRMApiError(`CiviCRM API error: ${data.error_message}`);
  }

  return data;
}
