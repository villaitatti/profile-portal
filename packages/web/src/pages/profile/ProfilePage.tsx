import { PageHeader } from '@/components/shared/PageHeader';
import { SkeletonBlock } from '@/components/shared/LoadingSpinner';
import { useProfile } from '@/api/profile';
import { User } from 'lucide-react';
import { EmailSection } from './EmailSection';
import { AddressSection } from './AddressSection';
import { PhoneSection } from './PhoneSection';

export function ProfilePage() {
  const { data: profile, isLoading, error } = useProfile();

  if (isLoading) return <ProfilePageSkeleton />;

  if (error) {
    return (
      <div>
        <PageHeader title="My Profile" />
        <div className="rounded-xl border bg-card p-8 text-center text-[0.98rem] leading-7 text-muted-foreground">
          <p>Unable to load profile information. Please try again later.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="My Profile" />

      <div className="grid grid-cols-1 items-start gap-6 md:grid-cols-2">
        <div className="rounded-xl border bg-card p-6 md:px-8">
          <div className="flex items-center gap-3">
            <User className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold tracking-tight">Name</h2>
          </div>
          <p className="mt-4 text-base text-foreground">
            {[profile?.firstName, profile?.lastName].filter(Boolean).join(' ') || '—'}
          </p>
        </div>

        <EmailSection email={profile?.email} />
        <AddressSection />
        <PhoneSection />
      </div>
    </div>
  );
}

function ProfilePageSkeleton() {
  return (
    <div className="space-y-6 motion-safe:animate-pulse">
      <div className="space-y-3">
        <SkeletonBlock className="h-10 w-48 rounded-full" />
      </div>

      <div className="grid grid-cols-1 items-start gap-6 md:grid-cols-2">
        <div className="overflow-hidden rounded-xl border bg-card p-6">
          <SkeletonBlock className="h-5 w-24 rounded-full" />
          <SkeletonBlock className="mt-4 h-5 w-40 rounded-full" />
        </div>

        <div className="overflow-hidden rounded-xl border bg-card p-6">
          <SkeletonBlock className="h-5 w-32 rounded-full" />
          <SkeletonBlock className="mt-4 h-5 w-56 rounded-full" />
        </div>

        <div className="overflow-hidden rounded-xl border bg-card p-6">
          <SkeletonBlock className="h-5 w-40 rounded-full" />
          <SkeletonBlock className="mt-4 h-20 w-full rounded-lg" />
        </div>

        <div className="overflow-hidden rounded-xl border bg-card p-6">
          <SkeletonBlock className="h-5 w-36 rounded-full" />
          <SkeletonBlock className="mt-4 h-16 w-full rounded-lg" />
        </div>
      </div>
    </div>
  );
}
