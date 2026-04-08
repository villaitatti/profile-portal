import { env, isDevMode } from '../env.js';
import { logger } from '../lib/logger.js';

// ── Types ──────────────────────────────────────────────────────────

export interface ScimUser {
  id: string;
  userName: string;
  displayName: string;
  name: { givenName: string; familyName: string };
  emails: { value: string; primary: boolean }[];
  active: boolean;
}

export interface ScimGroup {
  id: string;
  displayName: string;
  members: { value: string; display?: string }[];
}

interface ScimListResponse<T> {
  totalResults: number;
  startIndex: number;
  itemsPerPage: number;
  Resources: T[];
}

// ── Configuration ──────────────────────────────────────────────────

export function isScimConfigured(): boolean {
  return !!(
    env.ATLASSIAN_SCIM_BASE_URL &&
    env.ATLASSIAN_SCIM_DIRECTORY_ID &&
    env.ATLASSIAN_SCIM_BEARER_TOKEN
  );
}

function scimUrl(path: string): string {
  return `${env.ATLASSIAN_SCIM_BASE_URL}/${env.ATLASSIAN_SCIM_DIRECTORY_ID}${path}`;
}

// ── HTTP helper with backoff ───────────────────────────────────────

async function scimFetch(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const url = scimUrl(path);
  const maxRetries = 3;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${env.ATLASSIAN_SCIM_BEARER_TOKEN}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...options.headers,
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (response.status === 429 && attempt < maxRetries) {
      const backoff = Math.min(1000 * 2 ** attempt + Math.random() * 500, 60_000);
      logger.warn({ attempt, backoff, url }, 'SCIM rate limited, backing off');
      await new Promise((r) => setTimeout(r, backoff));
      continue;
    }

    return response;
  }

  throw new Error(`SCIM request failed after ${maxRetries + 1} attempts: ${path}`);
}

async function scimJson<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await scimFetch(path, options);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`SCIM API error ${response.status}: ${body}`);
  }
  return response.json() as Promise<T>;
}

// ── Dev mode mock data ─────────────────────────────────────────────

const MOCK_USERS: ScimUser[] = [
  {
    id: 'scim-user-1',
    userName: 'admin@itatti.harvard.edu',
    displayName: 'Admin User',
    name: { givenName: 'Admin', familyName: 'User' },
    emails: [{ value: 'admin@itatti.harvard.edu', primary: true }],
    active: true,
  },
  {
    id: 'scim-user-2',
    userName: 'staff@itatti.harvard.edu',
    displayName: 'Staff Member',
    name: { givenName: 'Staff', familyName: 'Member' },
    emails: [{ value: 'staff@itatti.harvard.edu', primary: true }],
    active: true,
  },
];

const MOCK_GROUPS: ScimGroup[] = [
  {
    id: 'scim-group-1',
    displayName: 'itatti-all-staff',
    members: [
      { value: 'scim-user-1', display: 'Admin User' },
      { value: 'scim-user-2', display: 'Staff Member' },
    ],
  },
];

// ── Users ──────────────────────────────────────────────────────────

export async function getUsers(): Promise<ScimUser[]> {
  if (isDevMode) return MOCK_USERS;

  const all: ScimUser[] = [];
  let startIndex = 1;
  const count = 100;

  while (true) {
    const page = await scimJson<ScimListResponse<ScimUser>>(
      `/scim/v2/Users?startIndex=${startIndex}&count=${count}`
    );
    all.push(...(page.Resources || []));
    if (startIndex + count > page.totalResults) break;
    startIndex += count;
  }

  return all;
}

export async function createUser(params: {
  email: string;
  givenName: string;
  familyName: string;
  displayName: string;
}): Promise<ScimUser> {
  if (isDevMode) {
    return {
      id: `scim-user-${Date.now()}`,
      userName: params.email,
      displayName: params.displayName,
      name: { givenName: params.givenName, familyName: params.familyName },
      emails: [{ value: params.email, primary: true }],
      active: true,
    };
  }

  return scimJson<ScimUser>('/scim/v2/Users', {
    method: 'POST',
    body: JSON.stringify({
      schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
      userName: params.email,
      displayName: params.displayName,
      name: {
        givenName: params.givenName,
        familyName: params.familyName,
      },
      emails: [{ value: params.email, type: 'work', primary: true }],
      active: true,
    }),
  });
}

export async function updateUser(
  scimId: string,
  params: { givenName?: string; familyName?: string; displayName?: string }
): Promise<ScimUser> {
  if (isDevMode) {
    const user = MOCK_USERS.find((u) => u.id === scimId);
    return { ...user!, ...params } as ScimUser;
  }

  const operations: { op: string; path: string; value: unknown }[] = [];
  if (params.displayName) {
    operations.push({ op: 'replace', path: 'displayName', value: params.displayName });
  }
  if (params.givenName || params.familyName) {
    operations.push({
      op: 'replace',
      path: 'name',
      value: { givenName: params.givenName, familyName: params.familyName },
    });
  }

  return scimJson<ScimUser>(`/scim/v2/Users/${scimId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
      Operations: operations,
    }),
  });
}

export async function deactivateUser(scimId: string): Promise<ScimUser> {
  if (isDevMode) {
    const user = MOCK_USERS.find((u) => u.id === scimId);
    return { ...user!, active: false };
  }

  return scimJson<ScimUser>(`/scim/v2/Users/${scimId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
      Operations: [{ op: 'replace', path: 'active', value: false }],
    }),
  });
}

// ── Groups ─────────────────────────────────────────────────────────

export async function getGroups(): Promise<ScimGroup[]> {
  if (isDevMode) return MOCK_GROUPS;

  const all: ScimGroup[] = [];
  let startIndex = 1;
  const count = 100;

  while (true) {
    const page = await scimJson<ScimListResponse<ScimGroup>>(
      `/scim/v2/Groups?startIndex=${startIndex}&count=${count}`
    );
    all.push(...(page.Resources || []));
    if (startIndex + count > page.totalResults) break;
    startIndex += count;
  }

  return all;
}

export async function createGroup(displayName: string): Promise<ScimGroup> {
  if (isDevMode) {
    return {
      id: `scim-group-${Date.now()}`,
      displayName,
      members: [],
    };
  }

  return scimJson<ScimGroup>('/scim/v2/Groups', {
    method: 'POST',
    body: JSON.stringify({
      schemas: ['urn:ietf:params:scim:schemas:core:2.0:Group'],
      displayName,
    }),
  });
}

export async function addGroupMember(
  groupId: string,
  userScimId: string
): Promise<void> {
  if (isDevMode) return;

  await scimFetch(`/scim/v2/Groups/${groupId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
      Operations: [
        { op: 'add', path: 'members', value: [{ value: userScimId }] },
      ],
    }),
  });
}

export async function removeGroupMember(
  groupId: string,
  userScimId: string
): Promise<void> {
  if (isDevMode) return;

  await scimFetch(`/scim/v2/Groups/${groupId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
      Operations: [
        { op: 'remove', path: `members[value eq "${userScimId}"]` },
      ],
    }),
  });
}
