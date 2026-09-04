import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Application } from '@itatti/shared';
import { Pencil, Trash2, ExternalLink } from 'lucide-react';
import { Link } from 'react-router';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';

interface AppTableProps {
  applications: Application[];
  onDelete: (id: number) => void | Promise<void>;
  isDeleting?: boolean;
}

export function AppTable({ applications, onDelete, isDeleting }: AppTableProps) {
  const { t } = useTranslation();
  const [deleteTarget, setDeleteTarget] = useState<Application | null>(null);

  const handleConfirmDelete = async () => {
    if (deleteTarget) {
      try {
        await onDelete(deleteTarget.id);
        setDeleteTarget(null);
      } catch {
        // Dialog stays open — error surfaced by parent via toast
      }
    }
  };

  return (
    <>
      <div className="overflow-hidden rounded-xl border bg-card">
        <table className="w-full text-[0.95rem]">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-4 py-3 text-left text-[0.82rem] font-semibold text-muted-foreground">
                {t('admin.apps.table.colApplication')}
              </th>
              <th className="hidden px-4 py-3 text-left text-[0.82rem] font-semibold text-muted-foreground md:table-cell">
                {t('admin.apps.table.colRoles')}
              </th>
              <th className="hidden px-4 py-3 text-left text-[0.82rem] font-semibold text-muted-foreground sm:table-cell">
                {t('admin.apps.table.colOrder')}
              </th>
              <th className="px-4 py-3 text-right text-[0.82rem] font-semibold text-muted-foreground">
                {t('admin.apps.table.colActions')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {applications.map((app) => (
              <tr key={app.id} className="hover:bg-muted/30">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    {app.imageUrl ? (
                      <img
                        src={app.imageUrl}
                        alt=""
                        className="h-8 w-14 rounded object-cover"
                      />
                    ) : (
                      <div className="h-8 w-14 rounded bg-primary/10" />
                    )}
                    <div>
                      <div className="text-[0.98rem] font-semibold">{app.name}</div>
                      <a
                        href={app.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[0.82rem] leading-5 text-muted-foreground hover:underline"
                      >
                        {app.url}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  </div>
                </td>
                <td className="hidden px-4 py-3 md:table-cell">
                  <div className="flex flex-wrap gap-1">
                    {app.requiredRoles.map((role) => (
                      <span
                        key={role}
                        className="inline-flex items-center rounded-full bg-secondary px-2.5 py-1 text-[0.75rem] font-medium text-secondary-foreground"
                      >
                        {role}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="hidden px-4 py-3 text-[0.92rem] text-muted-foreground sm:table-cell">
                  {app.sortOrder}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <Link
                      to={`/admin/apps/${app.id}/edit`}
                      aria-label={t('admin.apps.table.editApp', { name: app.name || app.id })}
                      className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted"
                      title={t('common.edit')}
                    >
                      <Pencil className="h-4 w-4" />
                    </Link>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(app)}
                      disabled={isDeleting}
                      aria-label={t('admin.apps.table.deleteApp', { name: app.name || app.id })}
                      className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                      title={t('common.delete')}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ConfirmDialog
        open={!!deleteTarget}
        onConfirm={() => void handleConfirmDelete()}
        onCancel={() => setDeleteTarget(null)}
        title={t('admin.apps.table.deleteTitle')}
        description={
          deleteTarget
            ? t('admin.apps.table.deleteDescription', { name: deleteTarget.name })
            : ''
        }
        confirmLabel={t('common.delete')}
        variant="danger"
      />
    </>
  );
}
