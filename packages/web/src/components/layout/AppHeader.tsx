import { Menu } from 'lucide-react';
import { useUIStore } from '@/stores/ui-store';

export function AppHeader() {
  const { isMobile, mobileMenuOpen, toggleMobileMenu } = useUIStore();

  if (!isMobile) return null;

  return (
    <header className="h-12 flex items-center px-4">
      <button
        onClick={toggleMobileMenu}
        className="p-2 rounded-md hover:bg-accent text-foreground transition-colors"
        aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
        aria-expanded={mobileMenuOpen}
      >
        <Menu className="h-5 w-5" />
      </button>
    </header>
  );
}
