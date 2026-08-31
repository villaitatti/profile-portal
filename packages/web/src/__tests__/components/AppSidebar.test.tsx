import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppSidebar } from '@/components/layout/AppSidebar';
import { SidebarProvider } from '@/components/ui/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';

const AUTH0_NAMESPACE = 'https://auth0.itatti.harvard.edu';

// Mock Auth0
vi.mock('@auth0/auth0-react', () => ({
  useAuth0: () => ({
    user: mockUser,
    isAuthenticated: true,
    logout: vi.fn(),
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

function renderSidebar(initialEntries = ['/']) {
  // AppSidebar uses useProfile() internally; wrap in a query client so
  // useQuery has a context to attach to. Disable retries and caches so
  // each test gets a clean slate.
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={initialEntries}>
        <TooltipProvider>
          <SidebarProvider>
            <AppSidebar />
          </SidebarProvider>
        </TooltipProvider>
      </MemoryRouter>
    </QueryClientProvider>
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
    expect(screen.getByText('Emails')).toBeInTheDocument();
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
    expect(screen.getByText('Emails')).toBeInTheDocument();
    expect(screen.getByText('Applications Catalog')).toBeInTheDocument();
    expect(screen.getByText('Access & Permissions')).toBeInTheDocument();
    expect(screen.getByText('Manage Group Mapping')).toBeInTheDocument();
    expect(screen.getByText('Sync Users to Atlassian Cloud')).toBeInTheDocument();
  });

  it('has navigation ARIA landmark', () => {
    setUserRoles(['fellows']);
    renderSidebar();

    const nav = screen.getByRole('navigation', { name: 'Main navigation' });
    expect(nav).toBeInTheDocument();
  });

  it('keeps Forms selected on the templates subroute', () => {
    setUserRoles(['fellows-admin']);
    renderSidebar(['/admin/forms/templates']);

    expect(screen.getByRole('link', { name: 'Forms' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(screen.getByRole('link', { name: 'Emails' })).not.toHaveAttribute(
      'aria-current'
    );
  });

  it('calls onNavigate when a link is clicked', () => {
    setUserRoles(['fellows']);
    const mockOnNavigate = vi.fn();
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
    });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <TooltipProvider>
            <SidebarProvider>
              <AppSidebar onNavigate={mockOnNavigate} />
            </SidebarProvider>
          </TooltipProvider>
        </MemoryRouter>
      </QueryClientProvider>
    );

    const dashboardLink = screen.getByRole('link', { name: /dashboard/i });
    fireEvent.click(dashboardLink);
    expect(mockOnNavigate).toHaveBeenCalled();
  });
});
