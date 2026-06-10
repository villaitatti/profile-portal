import { Outlet, useLocation } from 'react-router-dom';
import itattiLogo from '@/assets/itatti-logo.png';
import { cn } from '@/lib/utils';

export function PublicLayout() {
  const location = useLocation();
  const isFormRoute = location.pathname.startsWith('/forms/');

  return (
    <div className="min-h-screen bg-background">
      <header className="h-16 border-b border-primary/10 bg-card flex items-center px-6">
        <div className="h-8 w-32 flex-shrink-0">
          <img src={itattiLogo} alt="I Tatti" className="h-full w-full object-contain object-left" />
        </div>
        <span className="ml-3 text-sm text-muted-foreground">
          Profile Portal
        </span>
      </header>
      <main className={cn('mx-auto py-12 px-6', isFormRoute ? 'max-w-5xl' : 'max-w-2xl')}>
        <Outlet />
      </main>
    </div>
  );
}
