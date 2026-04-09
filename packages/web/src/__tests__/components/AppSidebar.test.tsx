import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppSidebar } from '@/components/layout/AppSidebar';

const AUTH0_NAMESPACE = 'https://auth0.itatti.harvard.edu';

// Mock Auth0
vi.mock('@auth0/auth0-react', () => ({
  useAuth0: () => ({
    user: mockUser,
    isAuthenticated: true,
    logout: vi.fn(),
  }),
}));

// Mock ui-store
vi.mock('@/stores/ui-store', () => ({
  useUIStore: () => ({
    sidebarCollapsed: false,
    toggleSidebar: vi.fn(),
  }),
}));

let mockUser: Record<string, unknown> = {};

function setUserRoles(roles: string[]) {
  mockUser = {
    email: 'test@example.com',
    name: 'Test User',
    [`${AUTH0_NAMESPACE}/roles`]: roles,
  };
}

function renderSidebar() {
  return render(
    <MemoryRouter>
      <AppSidebar />
    </MemoryRouter>
  );
}

describe('AppSidebar', () => {
  beforeEach(() => {
    mockUser = {};
  });

  it('shows only Dashboard and My Profile for regular users', () => {
    setUserRoles(['fellows']);
    renderSidebar();

    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('My Profile')).toBeInTheDocument();
    expect(screen.queryByText('VIT ID Administration')).not.toBeInTheDocument();
    expect(screen.queryByText('Portal Settings')).not.toBeInTheDocument();
    expect(screen.queryByText('Atlassian Cloud')).not.toBeInTheDocument();
  });

  it('shows VIT ID Administration for fellows-admin users', () => {
    setUserRoles(['fellows-admin']);
    renderSidebar();

    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('My Profile')).toBeInTheDocument();
    expect(screen.getByText('Has VIT ID?')).toBeInTheDocument();
    expect(screen.getByText('Manage Appointees')).toBeInTheDocument();
    expect(screen.queryByText('Portal Settings')).not.toBeInTheDocument();
    expect(screen.queryByText('Atlassian Cloud')).not.toBeInTheDocument();
  });

  it('shows all 4 sections for staff-IT users', () => {
    setUserRoles(['staff-IT']);
    renderSidebar();

    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('My Profile')).toBeInTheDocument();
    expect(screen.getByText('Has VIT ID?')).toBeInTheDocument();
    expect(screen.getByText('Manage Appointees')).toBeInTheDocument();
    expect(screen.getByText('Applications Catalog')).toBeInTheDocument();
    expect(screen.getByText('Manage Group Mapping')).toBeInTheDocument();
    expect(screen.getByText('Sync Users to Atlassian Cloud')).toBeInTheDocument();
  });

  it('has navigation ARIA landmark', () => {
    setUserRoles(['fellows']);
    renderSidebar();

    const nav = screen.getByRole('navigation', { name: 'Main navigation' });
    expect(nav).toBeInTheDocument();
  });

  it('calls onNavigate when a link is clicked', () => {
    setUserRoles(['fellows']);
    const mockOnNavigate = vi.fn();
    render(
      <MemoryRouter>
        <AppSidebar onNavigate={mockOnNavigate} />
      </MemoryRouter>
    );

    const dashboardLink = screen.getByRole('link', { name: /dashboard/i });
    fireEvent.click(dashboardLink);
    expect(mockOnNavigate).toHaveBeenCalled();
  });
});
