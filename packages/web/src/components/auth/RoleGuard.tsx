import { Outlet } from 'react-router-dom';
import { useUserRoles } from '@/hooks/useUserRoles';
import { hasAnyRole } from '@itatti/shared';
import { ShieldAlert } from 'lucide-react';

interface RoleGuardProps {
  requiredRoles: string[];
}

export function RoleGuard({ requiredRoles }: RoleGuardProps) {
  const userRoles = useUserRoles();

  if (!hasAnyRole(userRoles, requiredRoles)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-muted-foreground">
        <ShieldAlert className="h-16 w-16 mb-4" />
        <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
        <p>You do not have permission to view this page.</p>
      </div>
    );
  }

  return <Outlet />;
}
