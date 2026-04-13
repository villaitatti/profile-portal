import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/shared/PageHeader';
import { SkeletonBlock } from '@/components/shared/LoadingSpinner';
import { EmptyState } from '@/components/shared/EmptyState';
import { useApplications, useDeleteApplication } from '@/api/applications';
import { AppTable } from './components/AppTable';
import { Plus, Grid3X3 } from 'lucide-react';
import { toast } from 'sonner';

export function AppCatalogPage() {
  const { data: apps, isLoading } = useApplications();
  const deleteApp = useDeleteApplication();

  const handleDelete = async (id: number) => {
    try {
      await deleteApp.mutateAsync(id);
      toast.success('Application deleted');
    } catch (err) {
      toast.error('Failed to delete application');
      throw err; // re-throw so dialog stays open
    }
  };

  if (isLoading) return <AppCatalogPageSkeleton />;

  return (
    <div>
      <PageHeader
        title="Application Catalog"
        description="Manage internal applications shown to portal users"
        actions={
          <Link
            to="/admin/apps/new"
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            Add Application
          </Link>
        }
      />

      {!apps || apps.length === 0 ? (
        <EmptyState
          icon={<Grid3X3 className="h-12 w-12 mb-4" />}
          title="No applications yet"
          description="Add your first internal application to the catalog."
          action={
            <Link
              to="/admin/apps/new"
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" />
              Add Application
            </Link>
          }
        />
      ) : (
        <AppTable
          applications={apps}
          onDelete={handleDelete}
          isDeleting={deleteApp.isPending}
        />
      )}
    </div>
  );
}

function AppCatalogPageSkeleton() {
  return (
    <div className="space-y-10 motion-safe:animate-pulse">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="space-y-3">
          <SkeletonBlock className="h-10 w-64 rounded-full" />
          <SkeletonBlock className="h-5 w-[26rem] max-w-full rounded-full" />
        </div>
        <SkeletonBlock className="h-10 w-36 rounded-full" />
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="border-b bg-muted/50 px-4 py-3">
          <div className="grid grid-cols-[2fr_1fr_0.6fr_0.8fr] gap-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <SkeletonBlock key={index} className="h-3.5 rounded-full" />
            ))}
          </div>
        </div>
        <div className="divide-y">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="grid grid-cols-[2fr_1fr_0.6fr_0.8fr] items-center gap-4 px-4 py-4">
              <div className="flex items-center gap-3">
                <SkeletonBlock className="h-8 w-14 rounded-md" />
                <div className="space-y-2">
                  <SkeletonBlock className="h-4 w-36 rounded-full" />
                  <SkeletonBlock className="h-3.5 w-44 rounded-full" />
                </div>
              </div>
              <SkeletonBlock className="h-4 w-28 rounded-full" />
              <SkeletonBlock className="h-4 w-10 rounded-full" />
              <div className="ml-auto flex gap-2">
                <SkeletonBlock className="h-8 w-8 rounded-full" />
                <SkeletonBlock className="h-8 w-8 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
