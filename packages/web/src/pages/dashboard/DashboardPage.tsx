import { useAuth0 } from '@auth0/auth0-react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/shared/PageHeader';
import { SkeletonBlock } from '@/components/shared/LoadingSpinner';
import { EmptyState } from '@/components/shared/EmptyState';
import { useApplications } from '@/api/applications';
import { useProfile } from '@/api/profile';
import { User, ExternalLink, Grid3X3, ArrowRight, AlertCircle } from 'lucide-react';
import { LoginMethodBadge } from '@/components/shared/LoginMethodBadge';
import { Link } from 'react-router';

export function DashboardPage() {
  const { t } = useTranslation();
  const { user } = useAuth0();
  const { data: profile } = useProfile();
  const { data: apps, isLoading, error, isFetching, refetch } = useApplications();

  const fullName = profile
    ? `${profile.firstName} ${profile.lastName}`
    : user?.name || t('dashboard.fallbackName');

  return (
    <div className="mx-auto max-w-6xl space-y-12">
      <PageHeader
        title={t('dashboard.title')}
        description={t('dashboard.description')}
      />

      {/* Profile card */}
      <div className="flex flex-col gap-6 rounded-xl border bg-card px-8 py-7 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-5">
          <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-full bg-primary/10">
            {profile?.imageUrl || user?.picture ? (
              <img src={profile?.imageUrl || user?.picture} alt="" className="h-16 w-16 rounded-full object-cover" />
            ) : (
              <User className="h-8 w-8 text-primary" />
            )}
          </div>
          <div className="min-w-0">
            <h2 className="text-[1.75rem] font-semibold tracking-tight text-foreground">
              {fullName}
            </h2>
            <p className="mt-1 text-[1.02rem] leading-7 text-muted-foreground">
              {user?.email || ''}
            </p>
          </div>
        </div>
        <Link
          to="/profile"
          className="inline-flex flex-shrink-0 items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/92"
        >
          <ArrowRight className="h-4 w-4" />
          <span>{t('dashboard.viewProfile')}</span>
        </Link>
      </div>

      {/* Divider */}
      <hr className="border-border" />

      {/* Applications */}
      <div className="max-w-4xl">
        <h2 className="text-[1.65rem] font-semibold tracking-tight text-foreground">{t('dashboard.apps.title')}</h2>
        <div className="mt-3 mb-5 h-px w-12 bg-primary/35" />
        <p className="max-w-3xl text-[1.05rem] leading-7 text-muted-foreground">
          {t('dashboard.apps.intro')}
        </p>
        <p className="mt-2 max-w-3xl text-[1.05rem] leading-7 text-muted-foreground">
          {t('dashboard.apps.introSignIn')}
        </p>
        <div className="mt-6 grid max-w-4xl grid-cols-1 gap-x-10 gap-y-4 text-[1.02rem] leading-7 md:grid-cols-[auto_1fr] md:items-center">
          <LoginMethodBadge method="vit-id" />
          <span className="text-muted-foreground">{t('dashboard.apps.vitIdInfo')}</span>
          <LoginMethodBadge method="harvard-key" />
          <span className="text-muted-foreground">{t('dashboard.apps.harvardKeyInfo')}</span>
          <LoginMethodBadge method="none" />
          <span className="text-muted-foreground">{t('dashboard.apps.noneInfo')}</span>
        </div>
      </div>

      {isLoading ? (
        <DashboardPageSkeleton />
      ) : error ? (
        // Distinct from the empty state on purpose: a failed request must not
        // read as "you have no applications". role="alert" so assistive tech
        // announces the failure rather than a silent layout swap.
        <div role="alert">
          <EmptyState
            icon={<AlertCircle className="h-12 w-12 mb-4 text-destructive" />}
            title={t('dashboard.apps.errorTitle')}
            description={t('dashboard.apps.errorDescription')}
            action={
              <button
                type="button"
                onClick={() => void refetch()}
                disabled={isFetching}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/92 disabled:opacity-50"
              >
                {isFetching ? t('dashboard.apps.tryingAgain') : t('dashboard.apps.tryAgain')}
              </button>
            }
          />
        </div>
      ) : !apps || apps.length === 0 ? (
        <EmptyState
          icon={<Grid3X3 className="h-12 w-12 mb-4" />}
          title={t('dashboard.apps.emptyTitle')}
          description={t('dashboard.apps.emptyDescription')}
        />
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {apps.map((app, index) => (
            <a
              key={app.id}
              href={app.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex flex-col overflow-hidden rounded-xl border bg-card transition-[border-color,box-shadow] duration-250 [transition-timing-function:var(--ease-out-quart)] hover:border-primary/20 hover:shadow-lg motion-safe:animate-card-enter"
              style={{ animationDelay: `${Math.min(index, 5) * 75}ms` }}
            >
              {/* Preview image with hover overlay */}
              <div
                className="relative aspect-[16/9] overflow-hidden bg-muted"
                style={
                  app.blurPlaceholder
                    ? {
                        backgroundImage: `url(${app.blurPlaceholder})`,
                        backgroundSize: 'cover',
                      }
                    : undefined
                }
              >
                {app.imageUrl ? (
                  <img
                    src={app.imageUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <Grid3X3 className="h-10 w-10 text-muted-foreground/35" />
                  </div>
                )}

                <div className="absolute inset-0 flex items-end justify-center bg-gradient-to-t from-black/50 via-black/20 to-transparent opacity-0 transition-opacity duration-250 [transition-timing-function:var(--ease-out-quart)] group-hover:opacity-100">
                  <span className="mb-4 inline-flex translate-y-2 items-center gap-1.5 rounded-full bg-card/95 px-4 py-1.5 text-sm font-semibold text-card-foreground shadow-sm backdrop-blur-sm transition-transform duration-250 [transition-timing-function:var(--ease-out-quart)] group-hover:translate-y-0">
                    {t('dashboard.apps.visit')}
                    <ExternalLink className="h-3.5 w-3.5" />
                  </span>
                </div>
              </div>

              {/* Info */}
              <div className="flex flex-1 flex-col p-6">
                <h3 className="text-lg font-semibold tracking-tight">{app.name}</h3>
                {app.description && (
                  <p className="mt-2 line-clamp-3 text-[0.95rem] leading-6 text-muted-foreground">
                    {app.description}
                  </p>
                )}
                <div className="mt-auto pt-4">
                  <LoginMethodBadge method={app.loginMethod} />
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function DashboardPageSkeleton() {
  return (
    <div className="mx-auto max-w-6xl space-y-12 motion-safe:animate-pulse">
      <div className="space-y-3">
        <SkeletonBlock className="h-10 w-52 rounded-full" />
        <SkeletonBlock className="h-5 w-[34rem] max-w-full rounded-full" />
      </div>

      <div className="flex flex-col gap-6 rounded-xl border bg-card px-8 py-7 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-5">
          <SkeletonBlock className="h-16 w-16 rounded-full bg-muted/80" />
          <div className="space-y-3">
            <SkeletonBlock className="h-7 w-56 max-w-[70vw] rounded-full" />
            <SkeletonBlock className="h-4.5 w-64 max-w-[75vw] rounded-full" />
          </div>
        </div>
        <SkeletonBlock className="h-10 w-36 rounded-full" />
      </div>

      <hr className="border-border" />

      <div className="space-y-5">
        <div className="space-y-3">
          <SkeletonBlock className="h-7 w-44 rounded-full" />
          <SkeletonBlock className="h-px w-12 bg-primary/20" />
          <SkeletonBlock className="h-4.5 w-[28rem] max-w-full rounded-full" />
          <SkeletonBlock className="h-4.5 w-[32rem] max-w-full rounded-full" />
        </div>

        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="overflow-hidden rounded-xl border bg-card">
              <SkeletonBlock className="aspect-[16/9] w-full bg-muted/80" />
              <div className="space-y-4 p-6">
                <SkeletonBlock className="h-5 w-40 rounded-full" />
                <SkeletonBlock className="h-4 w-full rounded-full" />
                <SkeletonBlock className="h-4 w-5/6 rounded-full" />
                <SkeletonBlock className="h-4 w-24 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
