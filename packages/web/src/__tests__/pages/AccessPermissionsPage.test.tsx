import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';

const { mockUseUserRoles } = vi.hoisted(() => ({
  mockUseUserRoles: vi.fn<() => string[]>(),
}));

// The page derives everything else (sections, roles, API routes) from the
// real config/access.ts, which is exactly what these tests want to pin down.
vi.mock('@/hooks/useUserRoles', () => ({
  useUserRoles: mockUseUserRoles,
}));

import { AccessPermissionsPage } from '@/pages/admin/AccessPermissionsPage';

beforeEach(() => {
  vi.resetAllMocks();
  mockUseUserRoles.mockReturnValue(['staff-IT']);
});

/** The menu-visibility table row whose Section cell says `sectionLabel`. */
function sectionRow(sectionLabel: string) {
  const table = screen.getByRole('table');
  const row = within(table)
    .getAllByRole('row')
    .find((r) => within(r).queryByText(sectionLabel));
  expect(row, `row for section "${sectionLabel}"`).toBeDefined();
  return row!;
}

describe('AccessPermissionsPage — header and current roles', () => {
  it('renders the page title and the read-only marker', () => {
    render(<AccessPermissionsPage />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Access & Permissions' })
    ).toBeInTheDocument();
    expect(screen.getByText('Read-only')).toBeInTheDocument();
    expect(
      screen.getByText('Auth0 controls login; Auth0 roles control portal permissions')
    ).toBeInTheDocument();
  });

  it('shows the admin’s current role badges', () => {
    mockUseUserRoles.mockReturnValue(['staff-IT', 'fellows-admin']);
    render(<AccessPermissionsPage />);

    const rolesCard = screen.getByText('Your current roles').parentElement!;
    expect(within(rolesCard).getByText('staff-IT')).toBeInTheDocument();
    expect(within(rolesCard).getByText('fellows-admin')).toBeInTheDocument();
  });

  it('shows the no-role fallback when the session has no role claims', () => {
    mockUseUserRoles.mockReturnValue([]);
    render(<AccessPermissionsPage />);

    expect(screen.getByText('No role claims in this session')).toBeInTheDocument();
  });
});

describe('AccessPermissionsPage — menu visibility table', () => {
  it('renders one row per navigation section from the access config', () => {
    render(<AccessPermissionsPage />);

    const table = screen.getByRole('table');
    expect(within(table).getByText('Base Navigation')).toBeInTheDocument();
    expect(within(table).getByText('VIT ID Administration')).toBeInTheDocument();
    expect(within(table).getByText('Portal Settings')).toBeInTheDocument();
    expect(within(table).getByText('Atlassian Cloud')).toBeInTheDocument();
  });

  it('describes each section’s audience in plain English', () => {
    render(<AccessPermissionsPage />);

    expect(within(sectionRow('Base Navigation')).getByText('Any authenticated user')).toBeInTheDocument();
    expect(
      within(sectionRow('VIT ID Administration')).getByText('fellows-admin or staff-IT')
    ).toBeInTheDocument();
    expect(within(sectionRow('Portal Settings')).getByText('staff-IT only')).toBeInTheDocument();
    expect(within(sectionRow('Atlassian Cloud')).getByText('staff-IT only')).toBeInTheDocument();
  });

  it('lists the menu entries belonging to each section', () => {
    render(<AccessPermissionsPage />);

    const base = sectionRow('Base Navigation');
    expect(within(base).getByText('Dashboard')).toBeInTheDocument();
    expect(within(base).getByText('My Profile')).toBeInTheDocument();

    const vitId = sectionRow('VIT ID Administration');
    expect(within(vitId).getByText('Has VIT ID?')).toBeInTheDocument();
    expect(within(vitId).getByText('Manage Appointees')).toBeInTheDocument();
    expect(within(vitId).getByText('Emails')).toBeInTheDocument();
    expect(within(vitId).getByText('Forms')).toBeInTheDocument();

    const settings = sectionRow('Portal Settings');
    expect(within(settings).getByText('Claim Log')).toBeInTheDocument();
    expect(within(settings).getByText('Automations')).toBeInTheDocument();
    expect(within(settings).getByText('Applications Catalog')).toBeInTheDocument();
    expect(within(settings).getByText('Access & Permissions')).toBeInTheDocument();

    const atlassian = sectionRow('Atlassian Cloud');
    expect(within(atlassian).getByText('Manage Group Mapping')).toBeInTheDocument();
    expect(within(atlassian).getByText('Sync Users to Atlassian Cloud')).toBeInTheDocument();
  });

  it('marks every section visible for a staff-IT admin', () => {
    render(<AccessPermissionsPage />);

    expect(screen.getAllByText('Visible')).toHaveLength(4);
    expect(screen.queryByText('Hidden')).not.toBeInTheDocument();
  });

  it('marks the admin sections hidden for a user with no roles', () => {
    mockUseUserRoles.mockReturnValue([]);
    render(<AccessPermissionsPage />);

    expect(screen.getAllByText('Visible')).toHaveLength(1);
    expect(screen.getAllByText('Hidden')).toHaveLength(3);
    expect(within(sectionRow('Base Navigation')).getByText('Visible')).toBeInTheDocument();
  });

  it('lets a fellows-admin into VIT ID Administration but not Portal Settings', () => {
    mockUseUserRoles.mockReturnValue(['fellows-admin']);
    render(<AccessPermissionsPage />);

    expect(within(sectionRow('VIT ID Administration')).getByText('Visible')).toBeInTheDocument();
    expect(within(sectionRow('Portal Settings')).getByText('Hidden')).toBeInTheDocument();
    expect(within(sectionRow('Atlassian Cloud')).getByText('Hidden')).toBeInTheDocument();
  });
});

describe('AccessPermissionsPage — API access reference', () => {
  it('renders a card per access section with its audience', () => {
    render(<AccessPermissionsPage />);

    expect(screen.getByText('Authenticated portal')).toBeInTheDocument();
    expect(screen.getByText('Any authenticated Auth0 user')).toBeInTheDocument();
    // Portal Settings and Atlassian Cloud both say "staff-IT only" in their
    // cards, on top of the two table rows.
    expect(screen.getAllByText('staff-IT only').length).toBeGreaterThanOrEqual(4);
  });

  it('lists the backend route groups untranslated', () => {
    render(<AccessPermissionsPage />);

    expect(screen.getByText('GET /api/profile')).toBeInTheDocument();
    expect(screen.getByText('/api/admin/fellows/*')).toBeInTheDocument();
    expect(screen.getByText('/api/admin/claims/*')).toBeInTheDocument();
    expect(screen.getByText('/api/admin/sync/*')).toBeInTheDocument();
  });
});
