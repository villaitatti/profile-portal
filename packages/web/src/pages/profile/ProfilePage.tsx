import { PageHeader } from '@/components/shared/PageHeader';
import { SkeletonBlock } from '@/components/shared/LoadingSpinner';
import { useProfile } from '@/api/profile';
import { User, Mail, Phone, Database } from 'lucide-react';

export function ProfilePage() {
  const { data: profile, isLoading, error } = useProfile();

  if (isLoading) return <ProfilePageSkeleton />;

  if (error) {
    return (
      <div>
        <PageHeader title="My Profile" />
        <div className="rounded-2xl border bg-card p-8 text-center text-[0.98rem] leading-7 text-muted-foreground">
          <p>Unable to load profile information. Please try again later.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="My Profile"
        description={
          profile?.source === 'auth0'
            ? 'Showing information from your login account'
            : 'Information from I Tatti records'
        }
      />

      <div className="max-w-3xl rounded-2xl border bg-card">
        <div className="divide-y">
          <ProfileField
            icon={User}
            label="First Name"
            value={profile?.firstName}
          />
          <ProfileField
            icon={User}
            label="Last Name"
            value={profile?.lastName}
          />
          <ProfileField
            icon={Mail}
            label="Email"
            value={profile?.email}
          />
          <ProfileField
            icon={Phone}
            label="Phone"
            value={profile?.phone}
          />
        </div>

        {profile?.source && (
          <div className="rounded-b-2xl bg-muted/45 px-6 py-4 md:px-8">
            <div className="flex items-center gap-2 text-[0.82rem] text-muted-foreground">
              <Database className="h-3 w-3" />
              <span>
                Source: {profile.source === 'civicrm' ? 'I Tatti Records (CiviCRM)' : 'Login Account (Auth0)'}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ProfilePageSkeleton() {
  return (
    <div className="space-y-10 motion-safe:animate-pulse">
      <div className="space-y-3">
        <SkeletonBlock className="h-10 w-48 rounded-full" />
        <SkeletonBlock className="h-5 w-[26rem] max-w-full rounded-full" />
      </div>

      <div className="max-w-3xl overflow-hidden rounded-2xl border bg-card">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className={`flex items-center gap-5 px-6 py-5 md:px-8 ${index < 3 ? 'border-b border-border' : ''}`}
          >
            <SkeletonBlock className="h-5 w-5 rounded-full bg-muted/80" />
            <div className="space-y-3">
              <SkeletonBlock className="h-3 w-20 rounded-full" />
              <SkeletonBlock className="h-5 w-52 rounded-full" />
            </div>
          </div>
        ))}
        <div className="bg-muted/45 px-6 py-4 md:px-8">
          <SkeletonBlock className="h-4 w-44 rounded-full" />
        </div>
      </div>
    </div>
  );
}

function ProfileField({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value?: string;
}) {
  return (
    <div className="flex items-center gap-5 px-6 py-5 md:px-8">
      <Icon className="h-5 w-5 text-muted-foreground flex-shrink-0" />
      <div>
        <p className="text-[0.72rem] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          {label}
        </p>
        <p className="mt-1 text-base leading-7 text-foreground">{value || '—'}</p>
      </div>
    </div>
  );
}
