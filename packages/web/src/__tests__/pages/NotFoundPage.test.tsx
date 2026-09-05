import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { NotFoundPage } from '@/pages/NotFoundPage';

// Mirrors the route table: NotFoundPage is mounted on the catch-all `*` path
// (src/config/routes.tsx), so any address that matches no route lands here.
function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/dashboard" element={<p>dashboard</p>} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('NotFoundPage', () => {
  it('shows the not-found copy with a link back to the dashboard', () => {
    renderAt('/admin/typo-in-the-url');

    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
    expect(
      screen.getByText('There is no page at this address. Check the link, or go back to the dashboard.')
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to the dashboard' })).toHaveAttribute(
      'href',
      '/dashboard'
    );
    // A typo'd URL is never fixed by reloading — no reload advice here.
    expect(screen.queryByText(/reload/i)).not.toBeInTheDocument();
  });

  it('does not hijack real routes', () => {
    renderAt('/dashboard');

    expect(screen.getByText('dashboard')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Page not found' })).not.toBeInTheDocument();
  });
});
