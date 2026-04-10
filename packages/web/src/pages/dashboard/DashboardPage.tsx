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

      {/* Welcome banner */}
      <div className="flex items-center justify-between mb-10">
        <div className="flex items-center gap-4">
          <div className="h-10 w-10 bg-primary/10 flex items-center justify-center flex-shrink-0">
            {profile?.imageUrl || user?.picture ? (
              <img src={profile?.imageUrl || user?.picture} alt="" className="h-10 w-10 object-cover" />
            ) : (
              <User className="h-5 w-5 text-primary" />
            )}
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Welcome back,</p>
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              {fullName}
            </h2>
          </div>
        </div>
        <Link
          to="/profile"
          className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
        >
          View My Profile
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      {/* Applications */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold">Web Applications</h2>
        <p className="text-base text-muted-foreground mt-2 max-w-2xl leading-relaxed">
          Access your I Tatti web applications and services using your VIT ID or Harvard Key credentials.
        </p>
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
