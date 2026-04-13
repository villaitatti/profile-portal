import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { AppSidebar } from './AppSidebar';
import { AppHeader } from './AppHeader';
import { useUIStore } from '@/stores/ui-store';

export function AuthenticatedLayout() {
  const isMobile = useUIStore((s) => s.isMobile);
  const setIsMobile = useUIStore((s) => s.setIsMobile);
  const mobileMenuOpen = useUIStore((s) => s.mobileMenuOpen);
  const closeMobileMenu = useUIStore((s) => s.closeMobileMenu);

  useEffect(() => {
    const mql = window.matchMedia('(max-width: 767px)');
    const handleChange = (e: MediaQueryListEvent | MediaQueryList) => {
      setIsMobile(e.matches);
      if (!e.matches) closeMobileMenu();
    };
    handleChange(mql);
    mql.addEventListener('change', handleChange);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMobileMenu();
    };
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      mql.removeEventListener('change', handleChange);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [setIsMobile, closeMobileMenu]);

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      {!isMobile && <AppSidebar />}

      {/* Mobile drawer overlay */}
      {isMobile && mobileMenuOpen && (
        <>
          <div
            className="fixed inset-0 z-30 bg-[rgba(29,37,44,0.18)]"
            onClick={closeMobileMenu}
            aria-hidden="true"
          />
          <div className="fixed inset-y-0 left-0 z-40 transition-transform duration-300">
            <AppSidebar onNavigate={closeMobileMenu} />
          </div>
        </>
      )}

      <div className="flex-1 flex min-w-0 flex-col">
        <AppHeader />
        <main className={`flex-1 ${isMobile ? 'px-4 py-6' : 'px-12 py-10'}`}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
