import { useAuth0 } from '@auth0/auth0-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
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
    : user?.name || '';

  return (
    <div>
      <PageHeader title="Dashboard" />

      {/* Profile card */}
      <div className="inline-flex items-center gap-8 border bg-card p-10 mb-12">
        <div className="h-16 w-16 bg-primary/10 flex items-center justify-center flex-shrink-0">
          {user?.picture ? (
            <img src={user.picture} alt="" className="h-16 w-16 object-cover" />
          ) : (
            <User className="h-8 w-8 text-primary" />
          )}
        </div>
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground whitespace-nowrap">
            {fullName}
          </h2>
          <p className="text-base text-muted-foreground mt-1">
            {user?.email || ''}
          </p>
        </div>
        <Link
          to="/profile"
          className="group relative inline-flex items-center gap-2 border-2 border-primary bg-primary text-primary-foreground pl-6 pr-5 py-2.5 text-sm font-semibold tracking-wide uppercase overflow-hidden transition-all duration-300 hover:bg-transparent hover:text-primary hover:shadow-[0_0_20px_rgba(171,25,45,0.2)] flex-shrink-0"
        >
          <span className="absolute inset-0 bg-white translate-y-full transition-transform duration-300 ease-out group-hover:translate-y-0" />
          <span className="relative">View My Profile</span>
          <ArrowRight className="relative h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
        </Link>
      </div>

      {/* Divider */}
      <hr className="border-border mb-12" />

      {/* Applications */}
      <div className="mb-10">
        <h2 className="text-2xl font-bold">Web Applications</h2>
        <div className="w-10 h-[3px] bg-primary mt-2.5 mb-4" />
        <p className="text-base text-muted-foreground max-w-2xl leading-relaxed">
          These are the web applications and services you can access with your VIT ID or Harvard Key credentials.
        </p>
        <div className="mt-5 inline-grid grid-cols-[auto_1fr] gap-x-8 gap-y-3 text-base">
          <span className="font-semibold text-foreground">VIT ID</span>
          <span className="text-muted-foreground">Your Villa I Tatti identity, used for internal tools and services managed by I Tatti.</span>
          <span className="font-semibold text-foreground">Harvard Key</span>
          <span className="text-muted-foreground">Your Harvard University credential, providing access to university-wide resources and platforms.</span>
        </div>
      </div>

      {isLoading ? (
        <LoadingSpinner />
      ) : !apps || apps.length === 0 ? (
        <EmptyState
          icon={<Grid3X3 className="h-12 w-12 mb-4" />}
          title="No applications available"
          description="There are no applications configured for your roles."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {apps.map((app) => (
            <a
              key={app.id}
              href={app.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group border bg-card overflow-hidden hover:shadow-md transition-shadow"
            >
              {/* Preview image */}
              <div className="aspect-[16/9] bg-muted overflow-hidden">
                {app.imageUrl ? (
                  <img
                    src={app.imageUrl}
                    alt={`${app.name} preview`}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Grid3X3 className="h-10 w-10 text-muted-foreground/40" />
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="p-5">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-base font-semibold">{app.name}</h3>
                  <ExternalLink className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                </div>
                {app.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">
                    {app.description}
                  </p>
                )}
                <div className="flex items-center gap-2 mt-3">
                  <KeyRound className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
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
