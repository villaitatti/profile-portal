import { env, isDevMode } from '../env.js';
import { logger } from '../lib/logger.js';

interface JsmSiteConfig {
  url: string;
  formerOrgId: string;
  currentOrgId: string;
}

interface JsmCustomer {
  accountId: string;
  emailAddress: string;
  displayName: string;
}

export function isJsmConfigured(): boolean {
  return !!(
    env.JIRA_EMAIL &&
    env.JIRA_API_TOKEN &&
    env.ATLASSIAN_JSM_SITE1_URL &&
    env.ATLASSIAN_JSM_SITE2_URL &&
    env.ATLASSIAN_JSM_SITE1_FORMER_ORG_ID &&
    env.ATLASSIAN_JSM_SITE1_CURRENT_ORG_ID &&
    env.ATLASSIAN_JSM_SITE2_FORMER_ORG_ID &&
    env.ATLASSIAN_JSM_SITE2_CURRENT_ORG_ID
  );
}

function getSites(): JsmSiteConfig[] {
  return [
    {
      url: env.ATLASSIAN_JSM_SITE1_URL || '',
      formerOrgId: env.ATLASSIAN_JSM_SITE1_FORMER_ORG_ID || '',
      currentOrgId: env.ATLASSIAN_JSM_SITE1_CURRENT_ORG_ID || '',
    },
    {
      url: env.ATLASSIAN_JSM_SITE2_URL || '',
      formerOrgId: env.ATLASSIAN_JSM_SITE2_FORMER_ORG_ID || '',
      currentOrgId: env.ATLASSIAN_JSM_SITE2_CURRENT_ORG_ID || '',
    },
  ];
}

function getAuthHeader(): string {
  return `Basic ${Buffer.from(`${env.JIRA_EMAIL}:${env.JIRA_API_TOKEN}`).toString('base64')}`;
}

async function jsmFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: getAuthHeader(),
      'Content-Type': 'application/json',
      ...options.headers,
    },
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok && response.status !== 409) {
    const body = await response.text();
    throw new Error(`JSM API error: ${response.status} ${url} - ${body}`);
  }

  return response;
}

// --- Low-level per-site operations ---

export async function ensureCustomer(
  siteUrl: string,
  email: string,
  displayName: string
): Promise<string> {
  if (isDevMode) {
    logger.info({ siteUrl, email, displayName }, 'JSM (dev): would ensure customer');
    return `mock-account-${Date.now()}`;
  }

  const res = await jsmFetch(`${siteUrl}/rest/servicedeskapi/customer`, {
    method: 'POST',
    body: JSON.stringify({ email, displayName }),
  });

  const data = (await res.json()) as JsmCustomer;
  return data.accountId;
}

export async function addToOrganization(
  siteUrl: string,
  orgId: string,
  accountId: string
): Promise<void> {
  if (isDevMode) {
    logger.info({ siteUrl, orgId, accountId }, 'JSM (dev): would add to org');
    return;
  }

  const res = await jsmFetch(
    `${siteUrl}/rest/servicedeskapi/organization/${orgId}/user`,
    {
      method: 'POST',
      body: JSON.stringify({ accountIds: [accountId] }),
    }
  );

  // 204 No Content = success, 409 = already in org (both fine)
  if (res.status === 409) {
    logger.info({ siteUrl, orgId, accountId }, 'JSM: user already in org');
  }
}

export async function removeFromOrganization(
  siteUrl: string,
  orgId: string,
  accountId: string
): Promise<void> {
  if (isDevMode) {
    logger.info({ siteUrl, orgId, accountId }, 'JSM (dev): would remove from org');
    return;
  }

  await jsmFetch(
    `${siteUrl}/rest/servicedeskapi/organization/${orgId}/user`,
    {
      method: 'DELETE',
      body: JSON.stringify({ accountIds: [accountId] }),
    }
  );
}

export async function getOrganizationMembers(
  siteUrl: string,
  orgId: string
): Promise<{ accountId: string; emailAddress: string }[]> {
  if (isDevMode) {
    return [
      { accountId: 'mock-1', emailAddress: 'fellow1@example.com' },
      { accountId: 'mock-2', emailAddress: 'fellow2@example.com' },
    ];
  }

  const members: { accountId: string; emailAddress: string }[] = [];
  let start = 0;
  const limit = 50;

  for (let page = 0; page < 100; page++) {
    const res = await jsmFetch(
      `${siteUrl}/rest/servicedeskapi/organization/${orgId}/user?start=${start}&limit=${limit}`
    );
    const data = (await res.json()) as {
      values: { accountId: string; emailAddress: string }[];
      isLastPage: boolean;
    };

    members.push(...data.values);
    if (data.isLastPage) break;
    start += limit;
  }

  return members;
}

// --- High-level operations (both sites) ---

export async function addUserToFormerAppointees(
  email: string,
  displayName: string
): Promise<{ site1: boolean; site2: boolean }> {
  const sites = getSites();
  const results = { site1: false, site2: false };

  for (let i = 0; i < sites.length; i++) {
    const site = sites[i];
    const label = `site${i + 1}` as 'site1' | 'site2';
    try {
      const accountId = await ensureCustomer(site.url, email, displayName);
      await addToOrganization(site.url, site.formerOrgId, accountId);
      results[label] = true;
      logger.info({ email, site: site.url }, 'Added to Former Appointees');
    } catch (err) {
      logger.error({ err, email, site: site.url }, 'Failed to add to Former Appointees');
    }
  }

  return results;
}

export async function addUserToCurrentAppointees(
  email: string,
  displayName: string
): Promise<{ site1: boolean; site2: boolean }> {
  const sites = getSites();
  const results = { site1: false, site2: false };

  for (let i = 0; i < sites.length; i++) {
    const site = sites[i];
    const label = `site${i + 1}` as 'site1' | 'site2';
    try {
      const accountId = await ensureCustomer(site.url, email, displayName);
      await addToOrganization(site.url, site.currentOrgId, accountId);
      results[label] = true;
      logger.info({ email, site: site.url }, 'Added to Current Appointees');
    } catch (err) {
      logger.error({ err, email, site: site.url }, 'Failed to add to Current Appointees');
    }
  }

  return results;
}

export async function removeUserFromCurrentAppointees(
  email: string,
  displayName: string
): Promise<{ site1: boolean; site2: boolean }> {
  const sites = getSites();
  const results = { site1: false, site2: false };

  for (let i = 0; i < sites.length; i++) {
    const site = sites[i];
    const label = `site${i + 1}` as 'site1' | 'site2';
    try {
      const accountId = await ensureCustomer(site.url, email, displayName);
      await removeFromOrganization(site.url, site.currentOrgId, accountId);
      results[label] = true;
      logger.info({ email, site: site.url }, 'Removed from Current Appointees');
    } catch (err) {
      logger.error({ err, email, site: site.url }, 'Failed to remove from Current Appointees');
    }
  }

  return results;
}
