import { useAuth0 } from '@auth0/auth0-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { SkeletonBlock } from '@/components/shared/LoadingSpinner';
import { EmptyState } from '@/components/shared/EmptyState';
import { useApplications } from '@/api/applications';
import { useProfile } from '@/api/profile';
import { User, ExternalLink, Grid3X3, KeyRound, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

export function DashboardPage() {
  const { user } = useAuth0();
  const { data: profile } = useProfile();
  const { data: apps, isLoading } = useApplications();

  const fullName = profile
    ? `${profile.firstName} ${profile.lastName}`
    : user?.name || 'there';

  return (
    <div className="space-y-12">
      <PageHeader
        title="Dashboard"
        description="Access your profile and the internal services available to you through VIT ID and Harvard Key."
      />

      {/* Profile card */}
      <div className="flex flex-col gap-6 rounded-2xl border bg-card px-8 py-7 md:flex-row md:items-center md:justify-between">
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
          className="inline-flex flex-shrink-0 items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/92"
        >
          <span>View My Profile</span>
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      {/* Divider */}
      <hr className="border-border" />

      {/* Applications */}
      <div className="max-w-4xl">
        <h2 className="text-[1.65rem] font-semibold tracking-tight text-foreground">Web Applications</h2>
        <div className="mt-3 mb-5 h-px w-12 bg-primary/35" />
        <p className="max-w-3xl text-[1.05rem] leading-7 text-muted-foreground">
          These are the web applications and services you can access with your VIT ID or Harvard Key credentials.
        </p>
        <div className="mt-6 grid max-w-4xl grid-cols-1 gap-x-10 gap-y-4 text-[1.02rem] leading-7 md:grid-cols-[auto_1fr]">
          <span className="font-semibold text-foreground">VIT ID</span>
          <span className="text-muted-foreground">Your I Tatti identity, used for internal tools and services managed by I Tatti.</span>
          <span className="font-semibold text-foreground">Harvard Key</span>
          <span className="text-muted-foreground">Your Harvard University credential, providing access to university-wide resources and platforms.</span>
        </div>
      </div>

      {isLoading ? (
        <DashboardPageSkeleton />
      ) : !apps || apps.length === 0 ? (
        <EmptyState
          icon={<Grid3X3 className="h-12 w-12 mb-4" />}
          title="No applications available"
          description="There are no applications configured for your roles."
        />
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {apps.map((app) => (
            <a
              key={app.id}
              href={app.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group overflow-hidden rounded-2xl border bg-card transition-all hover:border-primary/20 hover:shadow-sm"
            >
              {/* Preview image */}
              <div className="aspect-[16/9] bg-muted overflow-hidden">
                {app.imageUrl ? (
                  <img
                    src={app.imageUrl}
                    alt={`${app.name} preview`}
                    className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Grid3X3 className="h-10 w-10 text-muted-foreground/35" />
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="p-6">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <h3 className="text-lg font-semibold tracking-tight">{app.name}</h3>
                  <ExternalLink className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                </div>
                {app.description && (
                  <p className="line-clamp-3 text-[0.95rem] leading-6 text-muted-foreground">
                    {app.description}
                  </p>
                )}
                <div className="mt-4 flex items-center gap-2">
                  <KeyRound className="h-4 w-4 text-muted-foreground" />
                  <span className="text-[0.95rem] text-muted-foreground">
                    {app.loginMethod === 'harvard-key' ? 'Harvard Key' : 'VIT ID'}
                  </span>
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
    <div className="space-y-12 motion-safe:animate-pulse">
      <div className="space-y-3">
        <SkeletonBlock className="h-10 w-52 rounded-full" />
        <SkeletonBlock className="h-5 w-[34rem] max-w-full rounded-full" />
      </div>

      <div className="flex flex-col gap-6 rounded-2xl border bg-card px-8 py-7 md:flex-row md:items-center md:justify-between">
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
            <div key={index} className="overflow-hidden rounded-2xl border bg-card">
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
