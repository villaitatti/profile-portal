import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';

/**
 * Catch-all for URLs that match no route (see the `*` entry in
 * src/config/routes.tsx). Distinct from RouteErrorPage: a typo'd address is
 * never fixed by reloading, so this page offers a way back instead.
 */
export function NotFoundPage() {
  const { t } = useTranslation();

  return (
    <div className="mx-auto max-w-md py-20 text-center">
      <h1 className="mb-2 text-2xl font-bold">{t('common.notFound.title')}</h1>
      <p className="text-muted-foreground">{t('common.notFound.description')}</p>
      <Link
        to="/dashboard"
        className="mt-6 inline-block rounded-md bg-primary px-4 py-2 text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        {t('common.notFound.goToDashboard')}
      </Link>
    </div>
  );
}
