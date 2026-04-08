import { PageHeader } from '@/components/shared/PageHeader';
import { Link } from 'react-router-dom';
import { useUserRoles } from '@/hooks/useUserRoles';
import { hasAnyRole, KnownRoles } from '@itatti/shared';
import { Grid3X3, Users, ArrowRight, RefreshCw } from 'lucide-react';

interface AdminCard {
  title: string;
  description: string;
  path: string;
  icon: React.ElementType;
  requiredRoles: string[];
}

const adminCards: AdminCard[] = [
  {
    title: 'Fellows Management',
    description: 'Monitor VIT ID provisioning for fellows',
    path: '/admin/fellows',
    icon: Users,
    requiredRoles: [KnownRoles.FELLOWS_ADMIN, KnownRoles.STAFF_IT],
  },
  {
    title: 'Application Catalog',
    description: 'Manage internal applications shown to users',
    path: '/admin/apps',
    icon: Grid3X3,
    requiredRoles: [KnownRoles.STAFF_IT],
  },
  {
    title: 'Atlassian Sync',
    description: 'Sync users and groups from Auth0 to Atlassian Cloud',
    path: '/admin/sync',
    icon: RefreshCw,
    requiredRoles: [KnownRoles.STAFF_IT],
  },
];

export function AdminPage() {
  const userRoles = useUserRoles();

  const visibleCards = adminCards.filter((card) =>
    hasAnyRole(userRoles, card.requiredRoles)
  );

  return (
    <div>
      <PageHeader
        title="Administration"
        description="Manage the Profile Portal"
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {visibleCards.map((card) => (
          <Link
            key={card.path}
            to={card.path}
            className="group rounded-xl border bg-card p-6 hover:shadow-md transition-shadow"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <card.icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold">{card.title}</h3>
                  <p className="text-sm text-muted-foreground">
                    {card.description}
                  </p>
                </div>
              </div>
              <ArrowRight className="h-5 w-5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
