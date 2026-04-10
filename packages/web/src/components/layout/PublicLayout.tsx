import { Outlet } from 'react-router-dom';
import itattiLogo from '@/assets/itatti-logo.png';

export function PublicLayout() {
  return (
    <div className="min-h-screen bg-background">
      <header className="h-16 border-b border-primary/10 bg-card flex items-center px-6">
        <img src={itattiLogo} alt="I Tatti" className="h-8 object-contain" />
        <span className="ml-3 text-sm text-muted-foreground">
          Profile Portal
        </span>
      </header>
      <main className="max-w-2xl mx-auto py-12 px-6">
        <Outlet />
      </main>
    </div>
  );
}
