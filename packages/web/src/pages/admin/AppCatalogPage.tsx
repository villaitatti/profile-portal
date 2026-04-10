import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/shared/PageHeader';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
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

  if (isLoading) return <LoadingSpinner />;

  return (
    <div>
      <PageHeader
        title="Application Catalog"
        description="Manage internal applications shown to portal users"
        actions={
          <Link
            to="/admin/apps/new"
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 transition-colors"
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
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90"
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
