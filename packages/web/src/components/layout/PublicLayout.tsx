import { Outlet } from 'react-router-dom';

export function PublicLayout() {
  return (
    <div className="min-h-screen bg-background">
      <header className="h-16 border-b bg-card flex items-center px-6">
        <span className="font-bold text-lg text-primary tracking-tight">
          I Tatti
        </span>
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
