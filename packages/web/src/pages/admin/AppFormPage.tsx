import { useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/shared/PageHeader';
import { SkeletonBlock } from '@/components/shared/LoadingSpinner';
import {
  useApplication,
  useCreateApplication,
  useUpdateApplication,
} from '@/api/applications';
import { AppForm, type AppFormData } from './components/AppForm';
import { toast } from 'sonner';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

export function AppFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEdit = Boolean(id);

  const { data: existingApp, isLoading } = useApplication(Number(id) || 0);
  const createApp = useCreateApplication();
  const updateApp = useUpdateApplication();

  const handleSubmit = (data: AppFormData) => {
    const input = {
      ...data,
      imageUrl: data.imageUrl || undefined,
    };

    if (isEdit && id) {
      updateApp.mutate(
        { id: Number(id), ...input },
        {
          onSuccess: () => {
            toast.success('Application updated');
            navigate('/admin/apps');
          },
          onError: () => toast.error('Failed to update application'),
        }
      );
    } else {
      createApp.mutate(input, {
        onSuccess: () => {
          toast.success('Application created');
          navigate('/admin/apps');
        },
        onError: () => toast.error('Failed to create application'),
      });
    }
  };

  if (isEdit && isLoading) return <AppFormPageSkeleton />;

  return (
    <div>
      <div className="mb-6">
        <Link
          to="/admin/apps"
          className="inline-flex items-center gap-1.5 text-[0.95rem] text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to catalog
        </Link>
      </div>

      <PageHeader
        title={isEdit ? 'Edit Application' : 'Add Application'}
        description={
          isEdit
            ? 'Update the application details'
            : 'Add a new internal application to the portal'
        }
      />

      <div className="max-w-3xl">
        <div className="rounded-2xl border bg-card p-7">
          <AppForm
            defaultValues={
              existingApp
                ? {
                    name: existingApp.name,
                    description: existingApp.description || '',
                    url: existingApp.url,
                    imageUrl: existingApp.imageUrl || '',
                    loginMethod: existingApp.loginMethod,
                    requiredRoles: existingApp.requiredRoles,
                    sortOrder: existingApp.sortOrder,
                  }
                : undefined
            }
            onSubmit={handleSubmit}
            isSubmitting={createApp.isPending || updateApp.isPending}
            submitLabel={isEdit ? 'Update Application' : 'Create Application'}
          />
        </div>
      </div>
    </div>
  );
}

function AppFormPageSkeleton() {
  return (
    <div className="space-y-6 motion-safe:animate-pulse">
      <SkeletonBlock className="h-4 w-28 rounded-full" />

      <div className="space-y-3">
        <SkeletonBlock className="h-10 w-56 rounded-full" />
        <SkeletonBlock className="h-5 w-64 rounded-full" />
      </div>

      <div className="max-w-3xl rounded-2xl border bg-card p-7">
        <div className="space-y-6">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="space-y-2">
              <SkeletonBlock className="h-4 w-32 rounded-full" />
              <SkeletonBlock className={`rounded-md ${index === 2 ? 'h-24' : 'h-11'} w-full`} />
            </div>
          ))}
          <div className="space-y-2">
            <SkeletonBlock className="h-4 w-24 rounded-full" />
            <div className="flex gap-4">
              <SkeletonBlock className="h-5 w-24 rounded-full" />
              <SkeletonBlock className="h-5 w-28 rounded-full" />
            </div>
          </div>
          <div className="space-y-2">
            <SkeletonBlock className="h-4 w-28 rounded-full" />
            <SkeletonBlock className="h-28 w-full rounded-md" />
          </div>
          <SkeletonBlock className="h-10 w-40 rounded-full" />
        </div>
      </div>
    </div>
  );
}
