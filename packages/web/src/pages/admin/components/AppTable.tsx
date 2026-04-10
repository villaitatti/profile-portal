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
    <div className="overflow-hidden rounded-2xl border bg-card">
      <table className="w-full text-[0.95rem]">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="px-4 py-3 text-left text-[0.68rem] font-medium uppercase tracking-[0.16em] text-muted-foreground">
              Application
            </th>
            <th className="hidden px-4 py-3 text-left text-[0.68rem] font-medium uppercase tracking-[0.16em] text-muted-foreground md:table-cell">
              Roles
            </th>
            <th className="hidden px-4 py-3 text-left text-[0.68rem] font-medium uppercase tracking-[0.16em] text-muted-foreground sm:table-cell">
              Order
            </th>
            <th className="px-4 py-3 text-right text-[0.68rem] font-medium uppercase tracking-[0.16em] text-muted-foreground">
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
              <td className="px-4 py-3 hidden md:table-cell">
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
                    className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted"
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
                    className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
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
