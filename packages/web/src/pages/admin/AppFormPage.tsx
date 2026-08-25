import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
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
            toast.success(t('admin.apps.updated'));
            navigate('/admin/apps');
          },
          onError: () => toast.error(t('admin.apps.updateFailed')),
        }
      );
    } else {
      createApp.mutate(input, {
        onSuccess: () => {
          toast.success(t('admin.apps.created'));
          navigate('/admin/apps');
        },
        onError: () => toast.error(t('admin.apps.createFailed')),
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
          {t('admin.apps.backToCatalog')}
        </Link>
      </div>

      <PageHeader
        title={isEdit ? t('admin.apps.editTitle') : t('admin.apps.addApplication')}
        description={
          isEdit ? t('admin.apps.editDescription') : t('admin.apps.addDescription')
        }
      />

      <div className="max-w-3xl">
        <div className="rounded-xl border bg-card p-7">
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
            submitLabel={isEdit ? t('admin.apps.updateSubmit') : t('admin.apps.createSubmit')}
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

      <div className="max-w-3xl rounded-xl border bg-card p-7">
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
