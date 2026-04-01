import type { Application } from '@itatti/shared';
import { Pencil, Trash2, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';

interface AppTableProps {
  applications: Application[];
  onDelete: (id: number) => void;
  isDeleting?: boolean;
}

export function AppTable({ applications, onDelete, isDeleting }: AppTableProps) {
  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Application
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider hidden md:table-cell">
              Roles
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider hidden sm:table-cell">
              Order
            </th>
            <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Actions
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
                    <div className="font-medium text-sm">{app.name}</div>
                    <a
                      href={app.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-muted-foreground hover:underline inline-flex items-center gap-1"
                    >
                      {app.url}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </div>
              </td>
              <td className="px-4 py-3 hidden md:table-cell">
                <div className="flex flex-wrap gap-1">
                  {app.requiredRoles.map((role) => (
                    <span
                      key={role}
                      className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-xs font-medium"
                    >
                      {role}
                    </span>
                  ))}
                </div>
              </td>
              <td className="px-4 py-3 text-sm text-muted-foreground hidden sm:table-cell">
                {app.sortOrder}
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center justify-end gap-1">
                  <Link
                    to={`/admin/apps/${app.id}/edit`}
                    className="p-2 rounded-md hover:bg-muted text-muted-foreground transition-colors"
                    title="Edit"
                  >
                    <Pencil className="h-4 w-4" />
                  </Link>
                  <button
                    onClick={() => {
                      if (confirm(`Delete "${app.name}"?`)) {
                        onDelete(app.id);
                      }
                    }}
                    disabled={isDeleting}
                    className="p-2 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
                    title="Delete"
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
  );
}
