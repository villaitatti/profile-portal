import { useNavigate, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/shared/PageHeader';
import { SkeletonBlock } from '@/components/shared/LoadingSpinner';
import {
  useApplication,
  useCreateApplication,
  useUpdateApplication,
} from '@/api/applications';
import { httpStatusOf, userErrorMessage } from '@/lib/errors';
import { AppForm, type AppFormData } from './components/AppForm';
import { toast } from 'sonner';
import { AlertCircle, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router';

export function AppFormPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEdit = Boolean(id);
  const appId = Number(id);
  // A non-numeric id (/admin/apps/abc/edit) leaves the query disabled, so it
  // must be treated as not-found here or the page would render a blank "edit"
  // form whose save would overwrite the application with empty values.
  const invalidId = isEdit && (!Number.isInteger(appId) || appId <= 0);

  const { data: existingApp, isLoading, error } = useApplication(Number(id) || 0);
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
            void navigate('/admin/apps');
          },
          onError: () => toast.error(t('admin.apps.updateFailed')),
        }
      );
    } else {
      createApp.mutate(input, {
        onSuccess: () => {
          toast.success(t('admin.apps.created'));
          void navigate('/admin/apps');
        },
        onError: () => toast.error(t('admin.apps.createFailed')),
      });
    }
  };

  if (isEdit && isLoading) return <AppFormPageSkeleton />;

  // Without these branches, a failed or empty lookup rendered a blank "edit"
  // form that would PUT blank values over the real application.
  const notFound = invalidId || httpStatusOf(error) === 404;
  if (isEdit && (notFound || error)) {
    return (
      <div>
        <BackToCatalogLink />
        <PageHeader title={t('admin.apps.editTitle')} />
        <div className="flex flex-col items-center justify-center py-16 text-destructive">
          <AlertCircle className="h-12 w-12 mb-4" />
          <h3 className="text-lg font-medium mb-1">
            {notFound ? t('admin.apps.notFoundTitle') : t('admin.apps.loadFailedTitle')}
          </h3>
          <p className="text-sm text-muted-foreground">
            {notFound ? t('admin.apps.notFoundBody') : userErrorMessage(error, t)}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <BackToCatalogLink />

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

function BackToCatalogLink() {
  const { t } = useTranslation();
  return (
    <div className="mb-6">
      <Link
        to="/admin/apps"
        className="inline-flex items-center gap-1.5 text-[0.95rem] text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {t('admin.apps.backToCatalog')}
      </Link>
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
