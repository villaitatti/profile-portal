import { PageHeader } from '@/components/shared/PageHeader';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { useProfile } from '@/api/profile';
import { User, Mail, Phone, Database } from 'lucide-react';

export function ProfilePage() {
  const { data: profile, isLoading, error } = useProfile();

  if (isLoading) return <LoadingSpinner />;

  if (error) {
    return (
      <div>
        <PageHeader title="My Profile" />
        <div className="rounded-xl border bg-card p-6 text-center text-muted-foreground">
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

      <div className="rounded-xl border bg-card">
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
          <div className="px-6 py-3 bg-muted/50 rounded-b-xl">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
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
    <div className="flex items-center gap-4 px-6 py-4">
      <Icon className="h-5 w-5 text-muted-foreground flex-shrink-0" />
      <div>
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
          {label}
        </p>
        <p className="text-sm mt-0.5">{value || '—'}</p>
      </div>
    </div>
  );
}
